import cron from 'node-cron';
import path from 'path';
import { promises as fsPromises } from 'fs';
import prisma from '../config/database.js';

// Run every 5 minutes
export const messageCleanupJob = cron.schedule(
  '*/5 * * * *',
  async () => {
    try {
      const now = new Date();

      // Find messages scheduled for deletion, including necessary fields
      const messagesToDelete = await prisma.message.findMany({
        where: {
          scheduledDeletionTime: { lte: now },
        },
        select: {
          id: true,
          conversationId: true,
          senderId: true,
          media: {
            select: { url: true },
          },
        },
      });

      // Process each message — delete associated media files
      for (const msg of messagesToDelete) {
        if (Array.isArray(msg.media) && msg.media.length > 0) {
          for (const mediaItem of msg.media) {
            if (mediaItem.url) {
              const correctedPath = mediaItem.url.includes('uploads')
                ? mediaItem.url
                : path.join('uploads', mediaItem.url);

              const filePath = path.join(process.cwd(), correctedPath);

              // Non-blocking delete
              await fsPromises.unlink(filePath).catch((err) => {
                console.error(`[Cron] Failed to delete file ${filePath}:`, err);
              });
            }
          }
        }
      }

      // Delete media records first (cascade), then messages
      const messageIds = messagesToDelete.map((m) => m.id);
      if (messageIds.length > 0) {
        await prisma.messageMedia.deleteMany({
          where: { messageId: { in: messageIds } },
        });

        const result = await prisma.message.deleteMany({
          where: { id: { in: messageIds } },
        });

        console.log(
          `[Cron] Deleted ${result.count} expired messages and their media at ${now.toISOString()}`
        );
      }
    } catch (error) {
      console.error('[Cron] Message cleanup failed:', error);
    }
  },
  {}
);

export default messageCleanupJob;
