import { CloudWatchClient, GetMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import moment from 'moment-timezone';
import axios from 'axios';

/**
 * Configuration
 * @typedef {Object} CONFIG
 * @property {Object} aws - AWS 相關配置
 * @property {string} aws.region - AWS 區域設定
 * @property {Object} aws.cloudwatch - CloudWatch 相關設定
 * @property {string} aws.cloudwatch.namespace - 監控的服務命名空間
 * @property {string} aws.cloudwatch.metricName - 監控的指標名稱 (要 Cloudwatch 完整名稱)
 * @property {number} aws.cloudwatch.period - 查詢間隔（秒）
 * @property {Object} thresholds - BounceRate 閾值設定
 * @property {Object} monitoring - 監控相關設定
 * @property {Object} webhook - Team WorkFlow Webhook 相關設定
 */
const config = {
    aws: {
        region: 'us-west-2',
        cloudwatch: {
            namespace: 'AWS/SES',
            metricName: 'Reputation.BounceRate',
            period: 1800,
        }
    },
    thresholds: {
        bounceRate: {
            normal: 0.03,    // 3%
            caution: 0.05,   // 5%
            danger: 0.10     // 10%
        }
    },
    monitoring: {
        defaultLookbackMinutes: 120,
    },
    webhook: {
        teams: 'https://prod-142.westus.logic.azure.com:443/workflows/5db304db595c4e03bf5346c307b3a6c3/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=EK1v1dHLzx9AEcjRcJJptjAEqkTEdt0rVYto65OHhFY'
    }
};

/**
 * 定義 Bounce Rate Types
 * @enum {string}
 */
const StatusTypes = {
    NORMAL: 'NORMAL',
    CAUTION: 'CAUTION',
    ALERT: 'ALERT',
    DANGER: 'DANGER'
};

/**
 * CloudWatch Service
 * 處理所有與 AWS CloudWatch 相關的操作
 */
class CloudWatchService {
    /**
     * 建立 CloudWatchService Instance
     * @param {string} region - AWS Region Setting
     */
    constructor(region = config.aws.region) {
        this.client = new CloudWatchClient({ region });
    }

    /**
     * 生成 CloudWatch 查詢參數
     * @param {Date} startTime - 查詢開始時間
     * @param {Date} endTime - 查詢結束時間
     * @returns {Object} CloudWatch 查詢參數物件
     */
    getMetricDataParams(startTime, endTime) {
        return {
            MetricDataQueries: [{
                Id: 'bounceRate',
                MetricStat: {
                    Metric: {
                        Namespace: config.aws.cloudwatch.namespace,
                        MetricName: config.aws.cloudwatch.metricName,
                    },
                    Period: config.aws.cloudwatch.period,
                    Stat: 'Average',
                },
                ReturnData: true,
            }],
            StartTime: startTime,
            EndTime: endTime,
        };
    }

    /**
     * 取得 BounceRate 數據
     * @param {Date} startTime - 查詢開始時間
     * @param {Date} endTime - 查詢結束時間
     * @returns {Promise<Array>} BounceRate 數據陣列 [{time:,bounceRate:},]
     * @throws {Error} 查詢失敗時拋出錯誤
     */
    async getBounceRateData(startTime, endTime) {
        try {
            const params = this.getMetricDataParams(startTime, endTime);
            const { MetricDataResults } = await this.client.send(
                new GetMetricDataCommand(params)
            );
            // console.log(this.formatMetricData(MetricDataResults));
            return this.formatMetricData(MetricDataResults);
        } catch (error) {
            throw new Error(`CloudWatch data fetch failed: ${error.message}`);
        }
    }

    /**
     * 格式化 CloudWatch 回傳的數據
     * @param {Array} metricResults - CloudWatch 原始數據
     * @returns {Array<Object>} 格式化後的數據陣列，包含時間和 BounceRate
     */
    formatMetricData(metricResults) {
        return metricResults.flatMap(item =>
            item.Timestamps.map((timestamp, index) => ({
                time: moment(timestamp).tz('Asia/Taipei').format('YYYY-MM-DD HH:mm:ss'),
                bounceRate: item.Values[index],
            }))
        );
    }
}

/**
 * Notification Service
 * 處理 Microsoft Teams WorkFlow 通知相關功能
 */
class NotificationService {
    /**
     * 建立通知服務 Instance
     * @param {string} webhookUrl - Teams WorkFlow Webhook URL
     */
    constructor(webhookUrl = config.webhook.teams) {
        this.webhookUrl = webhookUrl;
    }

    /**
     * 發送通知至 Teams
     * @param {Object} message - 要發送的訊息物件
     * @returns {Promise<Object>} API 回應結果
     * @throws {Error} 發送失敗時拋出錯誤
     */
    async sendNotification(message) {
        try {
            const response = await axios.post(this.webhookUrl, message);
            if (response.status === 202) {
                console.log('Successfully posted to Team Workflow App');
            }
            return response;
        } catch (error) {
            throw new Error(`Teams notification failed: ${error.message}`);
        }
    }

    /**
     * 建立 Teams 通知訊息
     * @param {Object} bounceRateData - BounceRate
     * @param {string} status - BounceRate 狀態
     * @returns {Object} Teams 訊息卡片物件
     */
    createTeamsMessage(bounceRateData, status) {
        const { time, bounceRate } = bounceRateData;
        const bounceRatePercentage = bounceRate * 100;

        return {
            body: {
                type: "message",
                attachments: [{
                    contentType: "application/vnd.microsoft.card.adaptive",
                    content: {
                        type: "AdaptiveCard",
                        version: "1.2",
                        "$schema": "https://adaptivecards.io/schemas/adaptive-card.json",
                        body: [
                            {
                                type: "TextBlock",
                                text: "資訊系統每日關鍵指標",
                                weight: "bolder",
                                size: "large"
                            },
                            {
                                type: "TextBlock",
                                text: `監控時間（台灣時間 UTC+8）: \n${time}`,
                                wrap: true
                            },
                            {
                                type: "TextBlock",
                                text: `1. Email Bounce Rate: ${bounceRatePercentage.toFixed(3)}%，${this.getStatusDescription(status)}`,
                                wrap: true
                            }
                        ]
                    }
                }
            ]
        }
    };
}

    /**
     * 建立錯誤通知訊息
     * @param {Error} error - 錯誤物件
     * @returns {Object} Teams 錯誤訊息卡片物件
     */
    createErrorMessage(error) {
        return {
            body: {
                type: "message",
                attachments: [{
                    contentType: "application/vnd.microsoft.card.adaptive",
                    content: {
                        type: "AdaptiveCard",
                        version: "1.2",
                        "$schema": "https://adaptivecards.io/schemas/adaptive-card.json",
                        body: [
                            {
                                type: "TextBlock",
                                text: "AWS SES Bounce Rate 監控錯誤",
                                weight: "bolder",
                                size: "large"
                            },
                            {
                                type: "TextBlock",
                                text: `錯誤信息: ${error.message}`,
                                wrap: true
                            }
                        ]
                    }
                }]
            }
        };
    }

    /**
     * 取得狀態描述文字
     * @param {string} status - 系統狀態
     * @returns {string} 狀態描述文字
     */
    getStatusDescription(status) {
        const descriptions = {
            [StatusTypes.NORMAL]: '在允許範圍3%以內，狀態為正常',
            [StatusTypes.CAUTION]: '在注意範圍3%~5%，狀態為注意',
            [StatusTypes.ALERT]: '在異常範圍5%以上，狀態為異常',
            [StatusTypes.DANGER]: '在危險範圍超過10%以上，狀態為危險'
        };
        return descriptions[status];
    }
}

/**
 * Bounce Rate Service
 * 處理 BounceRate 狀態判斷邏輯
 */
class BounceRateService {
    /**
     * 根據 BounceRate 判斷系統狀態
     * @param {number} bounceRate -  BounceRate 數值
     * @returns {string} 系統狀態
     */
    static getStatus(bounceRate) {
        const percentageRate = bounceRate * 100;
        const { normal, caution, danger } = config.thresholds.bounceRate;

        if (percentageRate < normal * 100) {
            return StatusTypes.NORMAL;
        } else if (percentageRate >= normal * 100 && percentageRate < caution * 100) {
            return StatusTypes.CAUTION;
        } else if (percentageRate >= caution * 100 && percentageRate < danger * 100) {
            return StatusTypes.ALERT;
        } else {
            return StatusTypes.DANGER;
        }
    }
}

/**
 * Main SES Monitor
 * 監控並發送報告 主要執行邏輯
 */
class SESMonitor {
    /**
     * 建立 SES 監控 Instance
     */
    constructor() {
        this.cloudWatchService = new CloudWatchService();
        this.notificationService = new NotificationService();
    }

    /**
     * 執行監控並發送報告
     * @returns {Promise<void>}
     */
    async monitorAndReport() {
        try {
            const endTime = new Date();
            const startTime = new Date(
                endTime - config.monitoring.defaultLookbackMinutes * 60 * 1000
            );
            
            const bounceRateData = await this.cloudWatchService.getBounceRateData(
                startTime,
                endTime
            );

            if (bounceRateData.length > 0) {
                await this.processAndNotify(bounceRateData[0]);
            } else {
                throw new Error('No bounce rate data available in the specified time range');
            }
        } catch (error) {
            await this.handleError(error);
        }
    }

    /**
     * 處理數據並發送通知
     * @param {Object} latestData - 最新的 BounceRate 數據
     * @returns {Promise<void>}
     */
    async processAndNotify(latestData) {
        const status = BounceRateService.getStatus(latestData.bounceRate);
        const message = this.notificationService.createTeamsMessage(latestData, status);
        await this.notificationService.sendNotification(message);
    }

    /**
     * 處理錯誤情況
     * @param {Error} error - 錯誤物件
     * @returns {Promise<void>}
     */
    async handleError(error) {
        console.error('Monitor error:', error);
        const errorMessage = this.notificationService.createErrorMessage(error);
        try {
            await this.notificationService.sendNotification(errorMessage);
        } catch (notificationError) {
            console.error('Error notification failed:', notificationError);
        }
    }
}

// Run the monitor
const monitor = new SESMonitor();
monitor.monitorAndReport();