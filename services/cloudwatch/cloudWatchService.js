import { CloudWatchClient, GetMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import moment from 'moment-timezone';
import { config } from '../../config/config.js';

/**
 * CloudWatch Service
 * 處理所有與 AWS CloudWatch 相關的操作
 */

export class CloudWatchService {
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

