import prisma from '../config/database.js';
import cron from 'node-cron';

export const scheduleInactiveUsersForDeletion = async () => {
  try {
    console.log('Running inactive user cleanup check...');
    const sevenMonthsAgo = new Date();
    sevenMonthsAgo.setMonth(sevenMonthsAgo.getMonth() - 7);

    const inactiveUsers = await prisma.user.findMany({
      where: {
        OR: [
          { lastSeen: { lt: sevenMonthsAgo } },
          { lastSeen: null, createdAt: { lt: sevenMonthsAgo } },
        ],
        isActive: true,
        role: { not: 'superadmin' },
      },
    });

    for (const user of inactiveUsers) {
      const existingSchedule = await prisma.userDeletionSchedule.findFirst({
        where: { userId: user.id, status: { in: ['scheduled', 'prevented'] } },
      });

      if (!existingSchedule) {
        const scheduledFor = new Date();
        scheduledFor.setDate(scheduledFor.getDate() + 30);

        await prisma.userDeletionSchedule.create({
          data: {
            userId: user.id,
            scheduledFor,
            reason: 'Inactive for 7+ months',
            lastActivity: user.lastSeen || user.createdAt,
          },
        });

        await prisma.adminActivityLog.create({
          data: {
            adminId: user.id, // System action
            action: 'schedule_deletion',
            targetType: 'user',
            targetId: user.id,
            details: { reason: 'Inactive for 7+ months', scheduled_for: scheduledFor },
            severity: 'medium',
          },
        });
      }
    }
  } catch (error) {
    console.error('Error in inactive user cleanup:', error);
  }
};

export const executeScheduledDeletions = async () => {
  try {
    const now = new Date();
    const schedulesToExecute = await prisma.userDeletionSchedule.findMany({
      where: { status: 'scheduled', scheduledFor: { lte: now } },
      include: { user: true },
    });

    for (const schedule of schedulesToExecute) {
      if (schedule.user) {
        // Update schedule status BEFORE deleting user (cascade would delete schedule)
        await prisma.userDeletionSchedule.update({
          where: { id: schedule.id },
          data: { status: 'deleted' },
        });
        await prisma.user.delete({ where: { id: schedule.user.id } });
      }
    }
  } catch (error) {
    console.error('Error executing scheduled deletions:', error);
  }
};

export const initializeCleanupService = () => {
  cron.schedule('0 2 * * *', scheduleInactiveUsersForDeletion);
  cron.schedule('0 3 * * *', executeScheduledDeletions);
  console.log('User cleanup service initialized');
};
