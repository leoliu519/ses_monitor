import { CloudWatchClient, GetMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import moment from 'moment-timezone';
import axios from 'axios';

// ======================
// Configuration
// ======================
const CONFIG = {
    aws: {
        region: 'us-west-2',
        cloudwatch: {
            namespace: 'AWS/SES',
            metricName: 'Reputation.BounceRate',
            period: 1800, // 30 minutes
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
        azure: 'https://prod-142.westus.logic.azure.com:443/workflows/5db304db595c4e03bf5346c307b3a6c3/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=EK1v1dHLzx9AEcjRcJJptjAEqkTEdt0rVYto65OHhFY'
    }
};

// ======================
// Types
// ======================
const StatusTypes = {
    NORMAL: 'NORMAL',
    CAUTION: 'CAUTION',
    ALERT: 'ALERT',
    DANGER: 'DANGER'
};

// ======================
// CloudWatch Service
// ======================
class CloudWatchService {
    constructor(region = CONFIG.aws.region) {
        this.client = new CloudWatchClient({ region });
    }

    getMetricDataParams(startTime, endTime) {
        return {
            MetricDataQueries: [{
                Id: 'bounceRate',
                MetricStat: {
                    Metric: {
                        Namespace: CONFIG.aws.cloudwatch.namespace,
                        MetricName: CONFIG.aws.cloudwatch.metricName,
                    },
                    Period: CONFIG.aws.cloudwatch.period,
                    Stat: 'Average',
                },
                ReturnData: true,
            }],
            StartTime: startTime,
            EndTime: endTime,
        };
    }

    async getBounceRateData(startTime, endTime) {
        try {
            const params = this.getMetricDataParams(startTime, endTime);
            const { MetricDataResults } = await this.client.send(
                new GetMetricDataCommand(params)
            );

            return this.formatMetricData(MetricDataResults);
        } catch (error) {
            throw new Error(`CloudWatch data fetch failed: ${error.message}`);
        }
    }

    formatMetricData(metricResults) {
        return metricResults.flatMap(item =>
            item.Timestamps.map((timestamp, index) => ({
                time: moment(timestamp).tz('Asia/Taipei').format('YYYY-MM-DD HH:mm:ss'),
                bounceRate: item.Values[index],
            }))
        );
    }
}

// ======================
// Notification Service
// ======================
class NotificationService {
    constructor(webhookUrl = CONFIG.webhook.azure) {
        this.webhookUrl = webhookUrl;
    }

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
                }]
            }
        };
    }

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

// ======================
// Bounce Rate Service
// ======================
class BounceRateService {
    static getStatus(bounceRate) {
        const percentageRate = bounceRate * 100;
        const { normal, caution, danger } = CONFIG.thresholds.bounceRate;

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

// ======================
// Main SES Monitor
// ======================
class SESMonitor {
    constructor() {
        this.cloudWatchService = new CloudWatchService();
        this.notificationService = new NotificationService();
    }

    async monitorAndReport() {
        try {
            const endTime = new Date();
            const startTime = new Date(
                endTime - CONFIG.monitoring.defaultLookbackMinutes * 60 * 1000
            );

            const bounceRateData = await this.cloudWatchService.getBounceRateData(
                startTime,
                endTime
            );

            if (bounceRateData.length > 0) {
                await this.processAndNotify(bounceRateData[0]);
            } else {
                throw new Error('No bounce rate data available in the specified time rang.....');
            }
        } catch (error) {
            await this.handleError(error);
        }
    }

    async processAndNotify(latestData) {
        const status = BounceRateService.getStatus(latestData.bounceRate);
        const message = this.notificationService.createTeamsMessage(latestData, status);
        await this.notificationService.sendNotification(message);
    }

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

// ======================
// Run the monitor
// ======================
const monitor = new SESMonitor();
monitor.monitorAndReport();