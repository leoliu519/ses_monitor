import { config } from '../../config/config.js';
import { StatusTypes } from './type.js';

/**
 * Bounce Rate Service
 * 處理 BounceRate 狀態判斷邏輯
 */

export class BounceRateService {
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

