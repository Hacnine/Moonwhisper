/**
 * Encryption Key Rotation Job
 * Runs daily at midnight (12:00 AM) to rotate backend encryption keys
 */

import cron from 'node-cron';
import { rotateEncryptionKeys, getEncryptionStats } from '../services/backendEncryptionService.js';
import { rotateAllTransportKeys } from '../services/smteService.js';
import logger from '../common/utils/logger.js';

/**
 * Start the encryption key rotation cron job
 * Runs at 00:00:00 (midnight) every day
 */
export function startEncryptionKeyRotation(): ReturnType<typeof cron.schedule> {
  const cronExpression = '0 0 * * *';

  const job = cron.schedule(
    cronExpression,
    async () => {
      try {
        logger.info('Starting daily encryption key rotation...');

        // Get stats before rotation
        const beforeStats = await getEncryptionStats();
        logger.info({ beforeStats }, 'Encryption stats before rotation');

        // Rotate backend storage keys
        const result = await rotateEncryptionKeys();

        // Rotate SMTE transport keys for all conversations
        let smteResult = { rotated: 0, total: 0 };
        try {
          smteResult = await rotateAllTransportKeys();
          logger.info({ smteResult }, 'SMTE transport key rotation completed');
        } catch (smteError) {
          logger.error({ error: smteError }, 'SMTE transport key rotation failed');
        }

        // Get stats after rotation
        const afterStats = await getEncryptionStats();

        logger.info(
          {
            result,
            smteResult,
            beforeStats,
            afterStats,
            rotatedAt: new Date().toISOString(),
          },
          'Daily encryption key rotation completed successfully'
        );
      } catch (error: any) {
        logger.error(
          {
            error,
            message: error.message,
            stack: error.stack,
          },
          'Failed to rotate encryption keys'
        );
      }
    },
    {
      timezone: 'UTC',
    }
  );

  logger.info({ cronExpression, timezone: 'UTC' }, 'Encryption key rotation job scheduled');

  return job;
}

/**
 * Manually trigger key rotation (for testing or emergency rotation)
 */
export async function manualKeyRotation() {
  try {
    logger.info('Manual encryption key rotation triggered');

    const beforeStats = await getEncryptionStats();
    const result = await rotateEncryptionKeys();
    const afterStats = await getEncryptionStats();

    logger.info({ result, beforeStats, afterStats }, 'Manual key rotation completed');

    return {
      ...result,
      beforeStats,
      afterStats,
    };
  } catch (error) {
    logger.error({ error }, 'Manual key rotation failed');
    throw error;
  }
}

export default {
  startEncryptionKeyRotation,
  manualKeyRotation,
};
