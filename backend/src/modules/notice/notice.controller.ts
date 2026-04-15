import { Request, Response } from 'express';
import prisma from '../../config/database.js';
import { notifyMany } from '../../services/notificationService.js';

// Valid NoticeAudience enum values (must match Prisma enum)
const VALID_AUDIENCES = ['all', 'user', 'admin', 'superadmin', 'moderator', 'teacher'] as const;
type NoticeAudienceValue = (typeof VALID_AUDIENCES)[number];

function isValidAudience(val: string): val is NoticeAudienceValue {
  return VALID_AUDIENCES.includes(val as any);
}

// Flatten join-table relations to plain userId arrays (matching old MongoDB shape)
function formatNotice(notice: any) {
  if (!notice) return notice;
  return {
    ...notice,
    readBy: notice.readBy ? notice.readBy.map((r: any) => r.userId) : [],
    likes: notice.likes ? notice.likes.map((l: any) => l.userId) : [],
    recipients: notice.recipients ? notice.recipients.map((r: any) => r.userId) : [],
  };
}

// POST / — create a new notice
export const createNotice = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const { title, content, targetAudience, eventType, eventDate, location } = req.body;

    if (!title || !content || !targetAudience) {
      res.status(400).json({ success: false, message: 'Title, content, and target audience are required' });
      return;
    }

    if (!isValidAudience(targetAudience)) {
      res.status(400).json({ success: false, message: `Invalid target audience. Must be one of: ${VALID_AUDIENCES.join(', ')}` });
      return;
    }

    // Get recipients based on target audience
    let recipientUsers: { id: string }[];
    if (targetAudience === 'all') {
      recipientUsers = await prisma.user.findMany({ select: { id: true } });
    } else {
      recipientUsers = await prisma.user.findMany({
        where: { role: targetAudience as any },
        select: { id: true },
      });
    }

    const notice = await prisma.notice.create({
      data: {
        title,
        content,
        targetAudience: targetAudience as any,
        eventType: eventType || 'general',
        creatorId: userId,
        eventDate: eventDate ? new Date(eventDate) : null,
        location: location || null,
        recipients: {
          create: recipientUsers.map((u) => ({ userId: u.id })),
        },
      },
      include: {
        creator: { select: { id: true, name: true } },
        recipients: true,
      },
    });

    const io = (req as any).io;
    if (io) io.emit('newNotice', formatNotice(notice));

    // Auto-generate notifications for all recipients
    const recipientIds = recipientUsers.map((u) => u.id).filter((id) => id !== userId);
    if (recipientIds.length > 0) {
      await notifyMany({
        recipientIds,
        senderId: userId,
        type: 'notice',
        title: `New Notice: ${title}`,
        message: content.length > 200 ? content.substring(0, 200) + '...' : content,
        data: { noticeId: notice.id, eventType: eventType || 'general' },
      });
    }

    res.status(201).json({ message: 'Notice created successfully', notice: formatNotice(notice) });
  } catch (error: any) {
    console.error('createNotice error:', error);
    res.status(500).json({ success: false, message: 'Failed to create notice', error: error.message });
  }
};

// GET / — get notices relevant to the user
export const getNotices = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;

    // Build audience filter — always include 'all', plus user's role if valid
    const audienceFilter: any[] = [{ targetAudience: 'all' as any }];
    if (isValidAudience(user.role)) {
      audienceFilter.push({ targetAudience: user.role as any });
    }

    const notices = await prisma.notice.findMany({
      where: {
        isActive: true,
        OR: audienceFilter,
      },
      include: {
        creator: { select: { id: true, name: true } },
        likes: true,
        readBy: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json(notices.map(formatNotice));
  } catch (error: any) {
    console.error('getNotices error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch notices', error: error.message });
  }
};

// GET /admin-notices/ — get notices created by the user
export const getCreatedNotices = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;

    const notices = await prisma.notice.findMany({
      where: { creatorId: userId, isActive: true },
      include: {
        creator: { select: { id: true, name: true } },
        likes: true,
        readBy: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json(notices.map(formatNotice));
  } catch (error: any) {
    console.error('getCreatedNotices error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch created notices', error: error.message });
  }
};

// PATCH /:noticeId — update a notice
export const updateNotice = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const noticeId = req.params.noticeId as string;
    const { title, content, targetAudience, eventType, eventDate, location } = req.body;

    const notice = await prisma.notice.findUnique({ where: { id: noticeId } });

    if (!notice) {
      res.status(404).json({ success: false, message: 'Notice not found' });
      return;
    }

    if (notice.creatorId !== userId) {
      res.status(403).json({ success: false, message: 'You can only update your own notices' });
      return;
    }

    // If audience changed, update recipients
    const audienceChanged = targetAudience && targetAudience !== notice.targetAudience;

    if (targetAudience && !isValidAudience(targetAudience)) {
      res.status(400).json({ success: false, message: `Invalid target audience. Must be one of: ${VALID_AUDIENCES.join(', ')}` });
      return;
    }

    const updated = await prisma.$transaction(async (tx: any) => {
      if (audienceChanged) {
        // Remove old recipients
        await tx.noticeRecipient.deleteMany({ where: { noticeId } });

        // Get new recipients
        let recipientUsers: { id: string }[];
        if (targetAudience === 'all') {
          recipientUsers = await tx.user.findMany({ select: { id: true } });
        } else {
          recipientUsers = await tx.user.findMany({
            where: { role: targetAudience },
            select: { id: true },
          });
        }

        await tx.noticeRecipient.createMany({
          data: recipientUsers.map((u) => ({ noticeId, userId: u.id })),
        });
      }

      return tx.notice.update({
        where: { id: noticeId },
        data: {
          ...(title !== undefined && { title }),
          ...(content !== undefined && { content }),
          ...(targetAudience !== undefined && { targetAudience }),
          ...(eventType !== undefined && { eventType }),
          ...(eventDate !== undefined && { eventDate: eventDate ? new Date(eventDate) : null }),
          ...(location !== undefined && { location }),
        },
        include: {
          creator: { select: { id: true, name: true } },
          recipients: true,
        },
      });
    });

    const io = (req as any).io;
    if (io) io.emit('updateNotice', formatNotice(updated));

    res.status(200).json({ message: 'Notice updated successfully', notice: formatNotice(updated) });
  } catch (error: any) {
    console.error('updateNotice error:', error);
    res.status(500).json({ success: false, message: 'Failed to update notice', error: error.message });
  }
};

// DELETE /:noticeId — soft delete a notice
export const deleteNotice = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const noticeId = req.params.noticeId as string;

    const notice = await prisma.notice.findUnique({ where: { id: noticeId } });

    if (!notice) {
      res.status(404).json({ success: false, message: 'Notice not found' });
      return;
    }

    if (notice.creatorId !== userId) {
      res.status(403).json({ success: false, message: 'You can only delete your own notices' });
      return;
    }

    await prisma.notice.update({
      where: { id: noticeId },
      data: { isActive: false },
    });

    const io = (req as any).io;
    if (io) io.emit('deleteNotice', { noticeId });

    res.status(200).json({ message: 'Notice deleted successfully' });
  } catch (error: any) {
    console.error('deleteNotice error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete notice', error: error.message });
  }
};

// POST /:noticeId/read — mark a notice as read
export const markNoticeAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const noticeId = req.params.noticeId as string;

    await prisma.noticeRead.upsert({
      where: { noticeId_userId: { noticeId, userId } },
      update: {},
      create: { noticeId, userId },
    });

    const notice = await prisma.notice.findUnique({
      where: { id: noticeId },
      include: {
        creator: { select: { id: true, name: true } },
        likes: true,
        readBy: true,
      },
    });

    const io = (req as any).io;
    if (io) io.to(userId).emit('updateNotice', formatNotice(notice));

    res.status(200).json({ message: 'Notice marked as read', notice: formatNotice(notice) });
  } catch (error: any) {
    console.error('markNoticeAsRead error:', error);
    res.status(500).json({ success: false, message: 'Failed to mark notice as read', error: error.message });
  }
};

// POST /reset-unread — reset unread count by marking all relevant notices as read
export const resetUnreadCount = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const userId = user.id;

    // Build audience filter — always include 'all', plus user's role if valid
    const audienceFilter: any[] = [{ targetAudience: 'all' as any }];
    if (isValidAudience(user.role)) {
      audienceFilter.push({ targetAudience: user.role as any });
    }

    // Find all relevant notices the user hasn't read
    const notices = await prisma.notice.findMany({
      where: {
        isActive: true,
        OR: audienceFilter,
        NOT: {
          readBy: { some: { userId } },
        },
      },
      select: { id: true },
    });

    if (notices.length > 0) {
      await prisma.noticeRead.createMany({
        data: notices.map((n: any) => ({ noticeId: n.id, userId })),
        skipDuplicates: true,
      });
    }

    res.status(200).json({ message: 'Unread count reset successfully' });
  } catch (error: any) {
    console.error('resetUnreadCount error:', error);
    res.status(500).json({ success: false, message: 'Failed to reset unread count', error: error.message });
  }
};

// POST /:noticeId/like — toggle like on a notice
export const toggleLikeNotice = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const noticeId = req.params.noticeId as string;

    const existingLike = await prisma.noticeLike.findUnique({
      where: { noticeId_userId: { noticeId, userId } },
    });

    if (existingLike) {
      await prisma.noticeLike.delete({ where: { id: existingLike.id } });
    } else {
      await prisma.noticeLike.create({ data: { noticeId, userId } });
    }

    const notice = await prisma.notice.findUnique({
      where: { id: noticeId },
      include: {
        creator: { select: { id: true, name: true } },
        likes: true,
        readBy: true,
      },
    });

    const io = (req as any).io;
    if (io) io.emit('updateNotice', formatNotice(notice));

    res.status(200).json({ message: 'Like toggled successfully', notice: formatNotice(notice) });
  } catch (error: any) {
    console.error('toggleLikeNotice error:', error);
    res.status(500).json({ success: false, message: 'Failed to toggle like', error: error.message });
  }
};
