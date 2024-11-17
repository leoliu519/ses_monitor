import axios from 'axios';
import { config } from '../../config/config.js';
import { StatusTypes } from '../bounceRate/type.js';

/**
 * Notification Service
 * 處理 Microsoft Teams WorkFlow 通知相關功能
 */

export class NotificationService {
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
                }]
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

