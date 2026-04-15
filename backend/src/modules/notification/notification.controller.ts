import { Request, Response } from 'express';
import prisma from '../../config/database.js';

// GET / — get user notifications (paginated, optional type/unread filter)
export const getUserNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 30;
    const skip = (page - 1) * limit;
    const unreadOnly = req.query.unreadOnly === 'true';
    const type = req.query.type as string | undefined;

    const where: any = { recipientId: userId };
    if (unreadOnly) where.isRead = false;
    if (type) where.type = type;

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        include: {
          sender: { select: { id: true, name: true, email: true, image: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { recipientId: userId, isRead: false } }),
    ]);

    res.status(200).json({
      notifications,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
      unreadCount,
    });
  } catch (error: any) {
    console.error('getUserNotifications error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch notifications', error: error.message });
  }
};

// PUT /:id/read — mark a single notification as read
export const markNotificationAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const id = req.params.id as string;

    const notification = await prisma.notification.findFirst({
      where: { id, recipientId: userId },
    });

    if (!notification) {
      res.status(404).json({ success: false, message: 'Notification not found' });
      return;
    }

    await prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });

    res.status(200).json({ message: 'Notification marked as read' });
  } catch (error: any) {
    console.error('markNotificationAsRead error:', error);
    res.status(500).json({ success: false, message: 'Failed to mark notification as read', error: error.message });
  }
};

// PUT /read-all — mark all notifications as read
export const markAllNotificationsAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;

    await prisma.notification.updateMany({
      where: { recipientId: userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });

    res.status(200).json({ message: 'All notifications marked as read' });
  } catch (error: any) {
    console.error('markAllNotificationsAsRead error:', error);
    res.status(500).json({ success: false, message: 'Failed to mark all as read', error: error.message });
  }
};

// DELETE /:id — delete a notification
export const deleteNotification = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const id = req.params.id as string;

    const notification = await prisma.notification.findFirst({
      where: { id, recipientId: userId },
    });

    if (!notification) {
      res.status(404).json({ success: false, message: 'Notification not found' });
      return;
    }

    await prisma.notification.delete({ where: { id } });

    res.status(200).json({ message: 'Notification deleted successfully' });
  } catch (error: any) {
    console.error('deleteNotification error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete notification', error: error.message });
  }
};

// DELETE /clear-all — delete all notifications for the user
export const clearAllNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;

    await prisma.notification.deleteMany({
      where: { recipientId: userId },
    });

    res.status(200).json({ message: 'All notifications cleared' });
  } catch (error: any) {
    console.error('clearAllNotifications error:', error);
    res.status(500).json({ success: false, message: 'Failed to clear notifications', error: error.message });
  }
};

// GET /unread/count — get unread notification count
export const getUnreadNotificationCount = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;

    const count = await prisma.notification.count({
      where: { recipientId: userId, isRead: false },
    });

    res.status(200).json({ count });
  } catch (error: any) {
    console.error('getUnreadNotificationCount error:', error);
    res.status(500).json({ success: false, message: 'Failed to get unread count', error: error.message });
  }
};
