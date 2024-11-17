import { CloudWatchService } from '../services/cloudwatch/cloudWatchService.js';
import { NotificationService } from '../services/notification/notificatonService.js';
import { BounceRateService } from '../services/bounceRate/bounceRateService.js';
import { config } from '../config/config.js';

/**
 * Main SES Monitor
 * 監控並發送報告 主要執行邏輯
 */

export class SESMonitor {
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