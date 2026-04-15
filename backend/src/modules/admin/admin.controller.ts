import { Request, Response } from 'express';
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
      severity: determineSeverity(action),
    },
  });
}

function determineSeverity(action: string): 'low' | 'medium' | 'high' | 'critical' {
  if (['suspend_user', 'reject_user', 'delete_user'].includes(action)) return 'high';
  if (['update_settings'].includes(action)) return 'medium';
  if (['approve_user', 'unsuspend_user'].includes(action)) return 'medium';
  return 'low';
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export const getDashboardStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      totalUsers,
      pendingApprovals,
      activeConversations,
      totalMessages,
      suspendedUsers,
      todayRegistrations,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.userApproval.count({ where: { status: 'pending' } }),
      prisma.conversation.count({
        where: { updatedAt: { gte: twentyFourHoursAgo } },
      }),
      prisma.message.count(),
      prisma.user.count({ where: { isActive: false } }),
      prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
    ]);

    res.status(200).json({
      totalUsers,
      pendingApprovals,
      activeConversations,
      totalMessages,
      suspendedUsers,
      todayRegistrations,
      systemHealth: 'healthy',
    });
  } catch (error: any) {
    console.error('getDashboardStats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch dashboard stats', error: error.message });
  }
};

// ─── Users ───────────────────────────────────────────────────────────────────

export const getAllUsersForAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const search = (req.query.search as string) || '';
    const status = req.query.status as string | undefined;
    const role = req.query.role as string | undefined;

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
      ];
    }

    if (status === 'active') where.isActive = true;
    else if (status === 'suspended') where.isActive = false;

    if (role) where.role = role;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true, name: true, email: true, gender: true, image: true,
          role: true, isActive: true, lastSeen: true, createdAt: true,
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    res.status(200).json({
      users,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error: any) {
    console.error('getAllUsersForAdmin error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch users', error: error.message });
  }
};

// ─── Approvals ───────────────────────────────────────────────────────────────

export const getPendingApprovals = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));

    const where = { status: 'pending' as const };

    const [approvals, total] = await Promise.all([
      prisma.userApproval.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true, image: true, createdAt: true } } },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { requestedAt: 'desc' },
      }),
      prisma.userApproval.count({ where }),
    ]);

    res.status(200).json({
      approvals,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error: any) {
    console.error('getPendingApprovals error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch pending approvals', error: error.message });
  }
};

export const approveUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const adminId = (req as any).user.id;
    const approvalId = req.params.approvalId as string;

    const approval = await prisma.userApproval.findUnique({ where: { id: approvalId } });
    if (!approval) {
      res.status(404).json({ success: false, message: 'Approval not found' });
      return;
    }

    await prisma.$transaction([
      prisma.userApproval.update({
        where: { id: approvalId },
        data: { status: 'approved', reviewedById: adminId, reviewedAt: new Date() },
      }),
      prisma.user.update({
        where: { id: approval.userId },
        data: { isActive: true },
      }),
    ]);

    await logAdminActivity(adminId, 'approve_user', 'user', approval.userId, { approvalId }, req);

    const updatedApproval = await prisma.userApproval.findUnique({
      where: { id: approvalId },
      include: { user: true },
    });

    res.status(200).json({ message: 'User approved successfully', approval: updatedApproval });
  } catch (error: any) {
    console.error('approveUser error:', error);
    res.status(500).json({ success: false, message: 'Failed to approve user', error: error.message });
  }
};

export const rejectUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const adminId = (req as any).user.id;
    const approvalId = req.params.approvalId as string;
    const { reason } = req.body;

    const approval = await prisma.userApproval.findUnique({ where: { id: approvalId } });
    if (!approval) {
      res.status(404).json({ success: false, message: 'Approval not found' });
      return;
    }

    await prisma.$transaction([
      prisma.userApproval.update({
        where: { id: approvalId },
        data: {
          status: 'rejected',
          reviewedById: adminId,
          reviewedAt: new Date(),
          rejectionReason: reason || null,
        },
      }),
      prisma.user.update({
        where: { id: approval.userId },
        data: { isActive: false },
      }),
    ]);

    await logAdminActivity(adminId, 'reject_user', 'user', approval.userId, { approvalId, reason }, req);

    const updatedApproval = await prisma.userApproval.findUnique({
      where: { id: approvalId },
      include: { user: true },
    });

    res.status(200).json({ message: 'User rejected successfully', approval: updatedApproval });
  } catch (error: any) {
    console.error('rejectUser error:', error);
    res.status(500).json({ success: false, message: 'Failed to reject user', error: error.message });
  }
};

// ─── Settings ────────────────────────────────────────────────────────────────

export const getAdminSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const adminId = (req as any).user.id;

    let settings = await prisma.adminSettings.findFirst({
      include: { allowedFileTypes: true, blockedWords: true, updatedBy: { select: { id: true, name: true, email: true } } },
      orderBy: { updatedAt: 'desc' },
    });

    if (!settings) {
      settings = await prisma.adminSettings.create({
        data: { updatedById: adminId },
        include: { allowedFileTypes: true, blockedWords: true, updatedBy: { select: { id: true, name: true, email: true } } },
      });
    }

    // Restructure to match old nested format
    const response = {
      id: settings.id,
      features: {
        voice_messages: settings.featureVoiceMessages,
        sms_notifications: settings.featureSmsNotif,
        image_sharing: settings.featureImageSharing,
        video_sharing: settings.featureVideoSharing,
        file_sharing: settings.featureFileSharing,
        voice_calling: settings.featureVoiceCalling,
        video_calling: settings.featureVideoCalling,
        group_creation: settings.featureGroupCreation,
        user_registration: settings.featureUserRegistration,
      },
      security: {
        require_admin_approval: settings.secRequireAdminApproval,
        auto_approve_after_hours: settings.secAutoApproveAfterHours,
        max_file_size_mb: settings.secMaxFileSizeMb,
        allowed_file_types: settings.allowedFileTypes.map((ft: any) => ft.fileType),
        message_encryption: settings.secMessageEncryption,
        two_factor_required: settings.secTwoFactorRequired,
        session_timeout_minutes: settings.secSessionTimeoutMinutes,
      },
      moderation: {
        auto_moderate_messages: settings.modAutoModerateMessages,
        blocked_words: settings.blockedWords.map((bw: any) => bw.word),
        max_message_length: settings.modMaxMessageLength,
        spam_detection: settings.modSpamDetection,
        image_content_filter: settings.modImageContentFilter,
      },
      rate_limits: {
        messages_per_minute: settings.rlMessagesPerMinute,
        files_per_hour: settings.rlFilesPerHour,
        friend_requests_per_day: settings.rlFriendRequestsPerDay,
        group_creation_per_day: settings.rlGroupCreationPerDay,
      },
      notifications: {
        admin_email_alerts: settings.notifAdminEmailAlerts,
        new_user_notifications: settings.notifNewUserNotifications,
        suspicious_activity_alerts: settings.notifSuspiciousActivityAlerts,
        system_maintenance_mode: settings.notifSystemMaintenanceMode,
      },
      updated_by: settings.updatedBy,
      createdAt: settings.createdAt,
      updatedAt: settings.updatedAt,
    };

    res.status(200).json(response);
  } catch (error: any) {
    console.error('getAdminSettings error:', error);
    res.status(500).json({ message: 'Failed to fetch admin settings', error: error.message });
  }
};

export const updateAdminSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const adminId = (req as any).user.id;

    let settings = await prisma.adminSettings.findFirst({ orderBy: { updatedAt: 'desc' } });

    if (!settings) {
      settings = await prisma.adminSettings.create({ data: { updatedById: adminId } });
    }

    const { features, security, moderation, rate_limits, notifications } = req.body;

    // Map nested old format to flat Prisma fields
    const updateData: any = { updatedById: adminId };

    if (features) {
      if (features.voice_messages !== undefined) updateData.featureVoiceMessages = features.voice_messages;
      if (features.sms_notifications !== undefined) updateData.featureSmsNotif = features.sms_notifications;
      if (features.image_sharing !== undefined) updateData.featureImageSharing = features.image_sharing;
      if (features.video_sharing !== undefined) updateData.featureVideoSharing = features.video_sharing;
      if (features.file_sharing !== undefined) updateData.featureFileSharing = features.file_sharing;
      if (features.voice_calling !== undefined) updateData.featureVoiceCalling = features.voice_calling;
      if (features.video_calling !== undefined) updateData.featureVideoCalling = features.video_calling;
      if (features.group_creation !== undefined) updateData.featureGroupCreation = features.group_creation;
      if (features.user_registration !== undefined) updateData.featureUserRegistration = features.user_registration;
    }

    if (security) {
      if (security.require_admin_approval !== undefined) updateData.secRequireAdminApproval = security.require_admin_approval;
      if (security.auto_approve_after_hours !== undefined) updateData.secAutoApproveAfterHours = security.auto_approve_after_hours;
      if (security.max_file_size_mb !== undefined) updateData.secMaxFileSizeMb = security.max_file_size_mb;
      if (security.message_encryption !== undefined) updateData.secMessageEncryption = security.message_encryption;
      if (security.two_factor_required !== undefined) updateData.secTwoFactorRequired = security.two_factor_required;
      if (security.session_timeout_minutes !== undefined) updateData.secSessionTimeoutMinutes = security.session_timeout_minutes;

      if (Array.isArray(security.allowed_file_types)) {
        updateData.allowedFileTypes = {
          deleteMany: {},
          create: security.allowed_file_types.map((ft: string) => ({ fileType: ft })),
        };
      }
    }

    if (moderation) {
      if (moderation.auto_moderate_messages !== undefined) updateData.modAutoModerateMessages = moderation.auto_moderate_messages;
      if (moderation.max_message_length !== undefined) updateData.modMaxMessageLength = moderation.max_message_length;
      if (moderation.spam_detection !== undefined) updateData.modSpamDetection = moderation.spam_detection;
      if (moderation.image_content_filter !== undefined) updateData.modImageContentFilter = moderation.image_content_filter;

      if (Array.isArray(moderation.blocked_words)) {
        updateData.blockedWords = {
          deleteMany: {},
          create: moderation.blocked_words.map((w: string) => ({ word: w })),
        };
      }
    }

    if (rate_limits) {
      if (rate_limits.messages_per_minute !== undefined) updateData.rlMessagesPerMinute = rate_limits.messages_per_minute;
      if (rate_limits.files_per_hour !== undefined) updateData.rlFilesPerHour = rate_limits.files_per_hour;
      if (rate_limits.friend_requests_per_day !== undefined) updateData.rlFriendRequestsPerDay = rate_limits.friend_requests_per_day;
      if (rate_limits.group_creation_per_day !== undefined) updateData.rlGroupCreationPerDay = rate_limits.group_creation_per_day;
    }

    if (notifications) {
      if (notifications.admin_email_alerts !== undefined) updateData.notifAdminEmailAlerts = notifications.admin_email_alerts;
      if (notifications.new_user_notifications !== undefined) updateData.notifNewUserNotifications = notifications.new_user_notifications;
      if (notifications.suspicious_activity_alerts !== undefined) updateData.notifSuspiciousActivityAlerts = notifications.suspicious_activity_alerts;
      if (notifications.system_maintenance_mode !== undefined) updateData.notifSystemMaintenanceMode = notifications.system_maintenance_mode;
    }

    const updated = await prisma.adminSettings.update({
      where: { id: settings.id },
      data: updateData,
      include: { allowedFileTypes: true, blockedWords: true },
    });

    await logAdminActivity(adminId, 'update_settings', 'settings', settings.id, { updated_fields: Object.keys(req.body) }, req);

    // Emit socket event with nested structure
    const io = (req as any).io;
    if (io) {
      const emitData = {
        features: {
          voice_messages: updated.featureVoiceMessages,
          sms_notifications: updated.featureSmsNotif,
          image_sharing: updated.featureImageSharing,
          video_sharing: updated.featureVideoSharing,
          file_sharing: updated.featureFileSharing,
          voice_calling: updated.featureVoiceCalling,
          video_calling: updated.featureVideoCalling,
          group_creation: updated.featureGroupCreation,
          user_registration: updated.featureUserRegistration,
        },
        security: {
          require_admin_approval: updated.secRequireAdminApproval,
          auto_approve_after_hours: updated.secAutoApproveAfterHours,
          max_file_size_mb: updated.secMaxFileSizeMb,
          allowed_file_types: updated.allowedFileTypes.map((ft: any) => ft.fileType),
          message_encryption: updated.secMessageEncryption,
          two_factor_required: updated.secTwoFactorRequired,
          session_timeout_minutes: updated.secSessionTimeoutMinutes,
        },
      };
      io.emit('settingsUpdated', emitData);
    }

    // Return nested structure
    const response = {
      id: updated.id,
      features: {
        voice_messages: updated.featureVoiceMessages,
        sms_notifications: updated.featureSmsNotif,
        image_sharing: updated.featureImageSharing,
        video_sharing: updated.featureVideoSharing,
        file_sharing: updated.featureFileSharing,
        voice_calling: updated.featureVoiceCalling,
        video_calling: updated.featureVideoCalling,
        group_creation: updated.featureGroupCreation,
        user_registration: updated.featureUserRegistration,
      },
      security: {
        require_admin_approval: updated.secRequireAdminApproval,
        auto_approve_after_hours: updated.secAutoApproveAfterHours,
        max_file_size_mb: updated.secMaxFileSizeMb,
        allowed_file_types: updated.allowedFileTypes.map((ft: any) => ft.fileType),
        message_encryption: updated.secMessageEncryption,
        two_factor_required: updated.secTwoFactorRequired,
        session_timeout_minutes: updated.secSessionTimeoutMinutes,
      },
      moderation: {
        auto_moderate_messages: updated.modAutoModerateMessages,
        blocked_words: updated.blockedWords.map((bw: any) => bw.word),
        max_message_length: updated.modMaxMessageLength,
        spam_detection: updated.modSpamDetection,
        image_content_filter: updated.modImageContentFilter,
      },
      rate_limits: {
        messages_per_minute: updated.rlMessagesPerMinute,
        files_per_hour: updated.rlFilesPerHour,
        friend_requests_per_day: updated.rlFriendRequestsPerDay,
        group_creation_per_day: updated.rlGroupCreationPerDay,
      },
      notifications: {
        admin_email_alerts: updated.notifAdminEmailAlerts,
        new_user_notifications: updated.notifNewUserNotifications,
        suspicious_activity_alerts: updated.notifSuspiciousActivityAlerts,
        system_maintenance_mode: updated.notifSystemMaintenanceMode,
      },
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };

    res.status(200).json({ message: 'Settings updated successfully', settings: response });
  } catch (error: any) {
    console.error('updateAdminSettings error:', error);
    res.status(500).json({ message: 'Failed to update settings', error: error.message });
  }
};

// ─── Suspend / Unsuspend ─────────────────────────────────────────────────────

export const suspendUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const adminId = (req as any).user.id;
    const userId: string = String(req.params.userId);
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
    await logAdminActivity(adminId, 'suspend_user', 'user', userId, { reason, duration, user_email: user.email }, req);

    const io = (req as any).io;
    if (io) {
      io.to(userId).emit('accountSuspended', { message: 'Your account has been suspended', reason, duration });
    }

    res.status(200).json({ message: 'User suspended successfully', user: updated });
  } catch (error: any) {
    console.error('suspendUser error:', error);
    res.status(500).json({ success: false, message: 'Failed to suspend user', error: error.message });
  }
};

export const unsuspendUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const adminId = (req as any).user.id;
    const userId: string = String(req.params.userId);

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
    await logAdminActivity(adminId, 'unsuspend_user', 'user', userId, { user_email: user.email }, req);

    const io = (req as any).io;
    if (io) {
      io.to(userId).emit('accountUnblocked', { message: 'Your account has been unblocked' });
    }

    res.status(200).json({ message: 'User unsuspended successfully', user: updated });
  } catch (error: any) {
    console.error('unsuspendUser error:', error);
    res.status(500).json({ success: false, message: 'Failed to unsuspend user', error: error.message });
  }
};

// ─── Activity Logs ───────────────────────────────────────────────────────────

export const getActivityLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const action = req.query.action as string | undefined;
    const severity = req.query.severity as string | undefined;
    const adminId = req.query.admin as string | undefined;

    const where: any = {};
    if (action) where.action = action;
    if (severity) where.severity = severity;
    if (adminId) where.adminId = adminId;

    const [logs, total] = await Promise.all([
      prisma.adminActivityLog.findMany({
        where,
        include: { admin: { select: { id: true, name: true, email: true, image: true } } },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.adminActivityLog.count({ where }),
    ]);

    res.status(200).json({
      logs,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error: any) {
    console.error('getActivityLogs error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch activity logs', error: error.message });
  }
};

// ─── System Health ───────────────────────────────────────────────────────────

export const getSystemHealth = async (req: Request, res: Response): Promise<void> => {
  try {
    // Database status
    let dbStatus = 'connected';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'disconnected';
    }

    // Active connections
    const io = (req as any).io;
    const activeConnections = io?.engine?.clientsCount || 0;

    // Recent errors (high/critical logs in last 24h)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentErrors = await prisma.adminActivityLog.count({
      where: {
        severity: { in: ['high', 'critical'] },
        createdAt: { gte: twentyFourHoursAgo },
      },
    });

    const memoryUsage = process.memoryUsage();

    const health = {
      database: dbStatus,
      activeConnections,
      recentErrors,
      memory: {
        used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      },
      uptime: Math.floor(process.uptime()),
      status: dbStatus === 'connected' && recentErrors < 10 ? 'healthy' : 'warning',
    };

    res.status(200).json(health);
  } catch (error: any) {
    console.error('getSystemHealth error:', error);
    res.status(500).json({ message: 'Failed to fetch system health', error: error.message });
  }
};
