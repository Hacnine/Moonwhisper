import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../../config/database.js';

// ─── Helper ──────────────────────────────────────────────────────────────────

async function logAdminActivity(
  adminId: string,
  action: string,
  targetType: 'user' | 'conversation' | 'message' | 'settings' | 'system',
  targetId: string | null,
  details: Record<string, any> | null,
  req: Request,
) {
  const ua = req.headers['user-agent'];
  await prisma.adminActivityLog.create({
    data: {
      adminId,
      action,
      targetType,
      targetId,
      details: details ?? undefined,
      userAgent: Array.isArray(ua) ? ua[0] : ua,
    },
  });
}

// ─── Get All Users ───────────────────────────────────────────────────────────

export const getAllUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const search = (req.query.search as string) || '';
    const status = req.query.status as string;
    const role = req.query.role as string;

    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
      ];
    }

    if (status === 'active') where.isActive = true;
    else if (status === 'inactive') where.isActive = false;

    if (role && role !== 'all') {
      where.role = role;
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true, name: true, email: true, gender: true, image: true,
          role: true, isActive: true, lastSeen: true, createdAt: true, updatedAt: true,
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    res.status(200).json({
      users,
      total,
      totalPages: Math.ceil(total / limit),
      page,
      limit,
    });
  } catch (error: any) {
    console.error('getAllUsers error:', error);
    res.status(500).json({ message: 'Failed to fetch users', error: error.message });
  }
};

// ─── Create User ─────────────────────────────────────────────────────────────

export const createUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const adminId = (req as any).user.id;
    const { name, email, password, gender, role } = req.body;

    if (!name || !email || !password || !gender) {
      res.status(400).json({ success: false, message: 'name, email, password and gender are required' });
      return;
    }

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { name }] },
    });
    if (existing) {
      res.status(409).json({ success: false, message: 'A user with this email or name already exists' });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        gender,
        role: role || 'user',
        isActive: true,
      },
      select: { id: true, name: true, email: true, gender: true, role: true, isActive: true, createdAt: true },
    });

    await logAdminActivity(adminId, 'create_user', 'user', user.id, { name, email, role: role || 'user' }, req);

    res.status(201).json({ message: 'User created successfully', user });
  } catch (error: any) {
    console.error('createUser error:', error);
    res.status(500).json({ success: false, message: 'Failed to create user', error: error.message });
  }
};

// ─── Update User ─────────────────────────────────────────────────────────────

export const updateUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const adminId = (req as any).user.id;
    const userId = req.params.userId as string;
    const { name, email, gender, role, image, bio } = req.body;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (gender !== undefined) updateData.gender = gender;
    if (role !== undefined) updateData.role = role;
    if (image !== undefined) updateData.image = image;
    if (bio !== undefined) updateData.bio = bio;

    const updated = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: { id: true, name: true, email: true, gender: true, role: true, image: true, bio: true, isActive: true, updatedAt: true },
    });

    await logAdminActivity(adminId, 'update_user', 'user', userId, { changes: Object.keys(updateData) }, req);

    res.status(200).json({ message: 'User updated successfully', user: updated });
  } catch (error: any) {
    console.error('updateUser error:', error);
    res.status(500).json({ success: false, message: 'Failed to update user', error: error.message });
  }
};

// ─── Delete User ─────────────────────────────────────────────────────────────

export const deleteUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const adminId = (req as any).user.id;
    const userId = req.params.userId as string;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    if (user.role === 'superadmin') {
      res.status(403).json({ success: false, message: 'Cannot delete a superadmin user' });
      return;
    }

    await prisma.$transaction([
      prisma.userDeletionSchedule.deleteMany({ where: { userId } }),
      prisma.user.delete({ where: { id: userId } }),
    ]);

    await logAdminActivity(adminId, 'delete_user', 'user', userId, { name: user.name, email: user.email }, req);

    res.status(200).json({ message: 'User deleted successfully' });
  } catch (error: any) {
    console.error('deleteUser error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete user', error: error.message });
  }
};

// ─── Block / Unblock ─────────────────────────────────────────────────────────

export const blockUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const adminId = (req as any).user.id;
    const userId = req.params.userId as string;
    const { reason, duration } = req.body;

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        blockedAt: new Date(),
        blockReason: reason || null,
        blockDuration: duration || null,
      },
      select: { id: true, name: true, email: true, isActive: true, role: true, blockedAt: true, blockReason: true, blockDuration: true },
    });
    await logAdminActivity(adminId, 'block_user', 'user', userId, { reason, duration, user_email: user.email }, req);

    res.status(200).json({ message: 'User blocked successfully', user: updated });
  } catch (error: any) {
    console.error('blockUser error:', error);
    res.status(500).json({ success: false, message: 'Failed to block user', error: error.message });
  }
};

export const unblockUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const adminId = (req as any).user.id;
    const userId = req.params.userId as string;

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        isActive: true,
        blockedAt: null,
        blockReason: null,
        blockDuration: null,
      },
      select: { id: true, name: true, email: true, isActive: true, role: true },
    });
    await logAdminActivity(adminId, 'unblock_user', 'user', userId, { user_email: user.email }, req);

    res.status(200).json({ message: 'User unblocked successfully', user: updated });
  } catch (error: any) {
    console.error('unblockUser error:', error);
    res.status(500).json({ success: false, message: 'Failed to unblock user', error: error.message });
  }
};

// ─── Scheduled Deletions ─────────────────────────────────────────────────────

export const getScheduledDeletions = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));

    const where = { status: 'scheduled' as const };

    const [schedules, total] = await Promise.all([
      prisma.userDeletionSchedule.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true, lastSeen: true } } },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { scheduledFor: 'asc' },
      }),
      prisma.userDeletionSchedule.count({ where }),
    ]);

    res.status(200).json({
      deletions: schedules,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      limit,
    });
  } catch (error: any) {
    console.error('getScheduledDeletions error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch scheduled deletions', error: error.message });
  }
};

export const preventDeletion = async (req: Request, res: Response): Promise<void> => {
  try {
    const adminId = (req as any).user.id;
    const scheduleId = req.params.scheduleId as string;
    const { reason } = req.body;

    const schedule = await prisma.userDeletionSchedule.findUnique({ where: { id: scheduleId } });
    if (!schedule) {
      res.status(404).json({ message: 'Schedule not found' });
      return;
    }

    await prisma.userDeletionSchedule.update({
      where: { id: scheduleId },
      data: {
        status: 'prevented',
        preventedById: adminId,
        preventedAt: new Date(),
        preventionReason: reason || null,
      },
    });

    await logAdminActivity(adminId, 'prevent_deletion', 'user', schedule.userId, { scheduleId, reason }, req);

    res.status(200).json({ message: 'Deletion prevented successfully' });
  } catch (error: any) {
    console.error('preventDeletion error:', error);
    res.status(500).json({ success: false, message: 'Failed to prevent deletion', error: error.message });
  }
};

export const cancelPreventionAndReschedule = async (req: Request, res: Response): Promise<void> => {
  try {
    const adminId = (req as any).user.id;
    const scheduleId = req.params.scheduleId as string;

    const schedule = await prisma.userDeletionSchedule.findUnique({ where: { id: scheduleId } });
    if (!schedule) {
      res.status(404).json({ message: 'Schedule not found' });
      return;
    }

    await prisma.userDeletionSchedule.update({
      where: { id: scheduleId },
      data: {
        status: 'scheduled',
        preventedById: null,
        preventedAt: null,
        preventionReason: null,
      },
    });

    await logAdminActivity(adminId, 'reschedule_deletion', 'user', schedule.userId, { scheduleId }, req);

    res.status(200).json({ message: 'Deletion rescheduled successfully' });
  } catch (error: any) {
    console.error('cancelPreventionAndReschedule error:', error);
    res.status(500).json({ success: false, message: 'Failed to reschedule deletion', error: error.message });
  }
};

// ─── Reset Password ─────────────────────────────────────────────────────────

export const resetUserPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const adminId = (req as any).user.id;
    const userId = req.params.userId as string;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      res.status(400).json({ message: 'New password is required and must be at least 6 characters' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({ where: { id: userId }, data: { password: hashedPassword } });
    await logAdminActivity(adminId, 'reset_password', 'user', userId, null, req);

    res.status(200).json({ message: 'Password reset successfully' });
  } catch (error: any) {
    console.error('resetUserPassword error:', error);
    res.status(500).json({ success: false, message: 'Failed to reset password', error: error.message });
  }
};

// ─── Inactive Users ──────────────────────────────────────────────────────────

export const getInactiveUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const months = parseInt(req.query.months as string) || 6;

    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);

    const where = {
      OR: [
        { lastSeen: { lt: cutoff } },
        { lastSeen: null, createdAt: { lt: cutoff } },
      ],
      isActive: true,
    };

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true, name: true, email: true, role: true, isActive: true, lastSeen: true, createdAt: true,
      },
      orderBy: { lastSeen: 'asc' },
    });

    res.status(200).json({ users, cutoffDate: cutoff });
  } catch (error: any) {
    console.error('getInactiveUsers error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch inactive users', error: error.message });
  }
};
