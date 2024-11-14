import { CloudWatchClient, GetMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import moment from 'moment-timezone';
import axios from 'axios';

// 設定門檻條件
const thresholds = { caution: 3, alert: 5 };

// Azure Logic App webhook URL
const AZURE_WEBHOOK_URL = 'https://prod-142.westus.logic.azure.com:443/workflows/5db304db595c4e03bf5346c307b3a6c3/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=EK1v1dHLzx9AEcjRcJJptjAEqkTEdt0rVYto65OHhFY';

async function getBounceRateData({
                                     region = 'us-west-2',
                                     startTime = new Date(Date.now() - 120 * 60 * 1000), // 60分鐘前
                                     // startTime = new Date(Date.now() - 120 * 60 * 1000), // 120分鐘前
                                     endTime = new Date(),
                                     // startTime = new Date('2024-11-14T03:00:00Z'), // UTC 時間
                                     // endTime = new Date('2024-11-14T03:59:59Z') // UTC 時間的 1 小時內

                                 }) {
    const cloudWatchClient = new CloudWatchClient({ region });

    const params = {
        MetricDataQueries: [
            {
                Id: 'bounceRate',
                MetricStat: {
                    Metric: {
                        Namespace: 'AWS/SES',
                        MetricName: 'Reputation.BounceRate',
                    },
                    // Period: 3600, // 60 minutes
                    Period: 1800, // 30 minutes
                    Stat: 'Average',
                },
                ReturnData: true,
            },
        ],
        StartTime: startTime,
        EndTime: endTime,
    };

    try {
        const { MetricDataResults } = await cloudWatchClient.send(new GetMetricDataCommand(params));
        const bounceRateData = MetricDataResults.flatMap((item) =>
            item.Timestamps.map((timestamp, index) => ({
                time: moment(timestamp).tz('Asia/Taipei').format('YYYY-MM-DD HH:mm:ss'),
                bounceRate: item.Values[index],
            }))
        );
        console.log(bounceRateData);
        return bounceRateData;
    } catch (error) {
        console.error('Error fetching bounce rate data:', error);
        throw error;
    }
}

function getStatus(bounceRate) {
    if (bounceRate < thresholds.caution) {
        return 'NORMAL';
    } else if (bounceRate >= thresholds.caution && bounceRate < thresholds.alert) {
        return 'CAUTION';
    } else if (bounceRate >= thresholds.alert && bounceRate < 10) {
        return 'ALERT';
    } else {
        return 'DANGER';
    }
}

function getStatusDescription(status) {
    switch (status) {
        case 'NORMAL':
            return '在允許範圍3%以內，狀態為正常';
        case 'CAUTION':
            return '在注意範圍3%~5%，狀態為注意';
        case 'ALERT':
            return '在異常範圍5%以上，狀態為異常';
        case 'DANGER':
            return '在危險範圍超過10%以上，狀態為危險';
        default:
            return '狀態未知';
    }
}

// 準備 Teams 訊息
function prepareTeamsMessage(bounceRateData, status) {
    const { time, bounceRate } = bounceRateData;
    const bounceRatePercentage = bounceRate * 100;

    return {
        body: {
            type: "message",
            attachments: [
                {
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
                                text: `1. Email Bounce Rate: ${bounceRatePercentage.toFixed(3)}%，${getStatusDescription(status)}`,
                                wrap: true
                            }
                        ]
                    }
                }
            ]
        }
    };
}

// 發送數據到 Team Workflow App
async function postToAzure(teamsMessage) {
    try {
        const response = await axios.post(AZURE_WEBHOOK_URL, teamsMessage);
        if (response.status === 202) {
            console.log('Successfully posted to Team Workflow App');
        }
        return response;
    } catch (error) {
        console.error('Error posting to Team Workflow App:', error);
        throw error;
    }
}

// 主要執行函數
async function monitorAndReport() {
    try {
        const bounceRateData = await getBounceRateData({
            region: 'us-west-2',
        });

        if (bounceRateData.length > 0) {
            const latestData = bounceRateData[0];
            console.log(bounceRateData[0]);

            // test rate
            // const latestData = { time: '2024-11-14 09:48:00', bounceRate: 0.04018144704051851926 } ;
            const status = getStatus(latestData.bounceRate * 100);

            const teamsMessage = prepareTeamsMessage(latestData, status);
            await postToAzure(teamsMessage);
        } else {
            console.log('BounceRate Data === [], it may be that no data was retrieved or the BounceRate is 0%');
        }
    } catch (error) {
        console.error('Error in monitoring and reporting:', error);

        // 發送錯誤訊息到 Teams
        const errorMessage = {
            body: {
                type: "message",
                attachments: [
                    {
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
                    }
                ]
            }
        };

        try {
            await postToAzure(errorMessage);
        } catch (postError) {
            console.error('Error posting error message to Teams:', postError);
        }
    }
}

// 執行監控
monitorAndReport();