import cron from 'node-cron';
import prisma from '../config/database.js';

/**
 * Automatically schedule users for deletion based on inactivity
 */
const scheduleInactiveUsersForDeletion = async (): Promise<{ message: string }> => {
  try {
    // Define inactivity threshold (7 months)
    const INACTIVITY_THRESHOLD = 7 * 30 * 24 * 60 * 60 * 1000; // 7 months in milliseconds
    const cutoffDate = new Date(Date.now() - INACTIVITY_THRESHOLD);

    // Find users already scheduled for deletion (to exclude them)
    const alreadyScheduledUserIds = await prisma.userDeletionSchedule
      .findMany({
        where: { status: 'scheduled' },
        select: { userId: true },
      })
      .then((rows) => rows.map((r) => r.userId));

    // Find users who haven't logged in since the cutoff date or never logged in and created before cutoff
    const inactiveUsers = await prisma.user.findMany({
      where: {
        id: { notIn: alreadyScheduledUserIds },
        OR: [
          { lastSeen: { lt: cutoffDate } },
          {
            AND: [{ lastSeen: null }, { createdAt: { lt: cutoffDate } }],
          },
        ],
      },
      select: { id: true, name: true, email: true, lastSeen: true, createdAt: true },
    });

    // Schedule deletion for each inactive user
    for (const user of inactiveUsers) {
      const scheduledDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
      await prisma.userDeletionSchedule.create({
        data: {
          userId: user.id,
          scheduledFor: scheduledDate,
          reason: 'Inactive for 7+ months',
          status: 'scheduled',
          lastActivity: user.lastSeen || user.createdAt,
        },
      });
      console.log(
        `User scheduled for deletion: Name: ${user.name}, Email: ${user.email}, Scheduled Date: ${scheduledDate}`
      );
    }

    console.log(`Total: Scheduled ${inactiveUsers.length} users for deletion.`);
    return { message: `Successfully scheduled ${inactiveUsers.length} users for deletion.` };
  } catch (error: any) {
    console.error('Failed to schedule deletions:', error);
    throw new Error(`Failed to schedule deletions: ${error.message}`);
  }
};

/**
 * Execute scheduled deletions
 */
const executeScheduledDeletions = async (): Promise<{ message: string }> => {
  try {
    const currentDate = new Date();
    // Find schedules due for deletion
    const dueSchedules = await prisma.userDeletionSchedule.findMany({
      where: {
        status: 'scheduled',
        scheduledFor: { lte: currentDate },
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    // Delete users and update schedules (update schedule BEFORE deleting user due to cascade)
    for (const schedule of dueSchedules) {
      if (schedule.user) {
        await prisma.userDeletionSchedule.update({
          where: { id: schedule.id },
          data: { status: 'deleted' },
        });
        await prisma.user.delete({ where: { id: schedule.user.id } });
        console.log(
          `User deleted: Name: ${schedule.user.name}, Email: ${schedule.user.email}, Deleted At: ${new Date()}`
        );
      } else {
        // Handle case where user no longer exists
        await prisma.userDeletionSchedule.update({
          where: { id: schedule.id },
          data: {
            status: 'cancelled',
            preventionReason: 'User not found',
          },
        });
        console.log(
          `Schedule cancelled (user not found): ID: ${schedule.userId}, Scheduled For: ${schedule.scheduledFor}`
        );
      }
    }

    console.log(`Total: Processed ${dueSchedules.length} scheduled deletions.`);
    return { message: `Successfully processed ${dueSchedules.length} scheduled deletions.` };
  } catch (error: any) {
    console.error('Failed to execute deletions:', error);
    throw new Error(`Failed to execute deletions: ${error.message}`);
  }
};

/**
 * Start cron jobs for scheduled user deletion
 */
export const startCronJobsForScheduledDeletion = (): void => {
  // Schedule user deletion scheduling at 6:44 AM daily
  cron.schedule('44 6 * * *', async () => {
    console.log('Running automatic deletion scheduling...');
    try {
      await scheduleInactiveUsersForDeletion();
      console.log('Automatic deletion scheduling completed.');
    } catch (error) {
      console.error('Automatic deletion scheduling failed:', error);
    }
  });

  // Execute scheduled deletions at 7:00 AM daily
  cron.schedule('0 7 * * *', async () => {
    console.log('Running scheduled deletion execution...');
    try {
      await executeScheduledDeletions();
      console.log('Scheduled deletion execution completed.');
    } catch (error) {
      console.error('Scheduled deletion execution failed:', error);
    }
  });

  console.log('Scheduled deletion cron jobs started successfully.');
};
