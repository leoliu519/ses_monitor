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
export const config = {
    aws: {
        region: 'us-west-2',
        cloudwatch: {
            namespace: 'AWS/SES',
            metricName: 'Reputation.BounceRate',
            period: 3600,
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
        defaultLookbackMinutes: 720,
    },
    webhook: {
        teams: 'https://prod-142.westus.logic.azure.com:443/workflows/5db304db595c4e03bf5346c307b3a6c3/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=EK1v1dHLzx9AEcjRcJJptjAEqkTEdt0rVYto65OHhFY'
    }
};