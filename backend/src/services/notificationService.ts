/**
 * Notification Service — Facebook-style notification engine
 *
 * Call from any module to create user notifications with real-time delivery.
 * Supports single-user, multi-user, and role-based targeting.
 */

import prisma from '../config/database.js';
import { Server } from 'socket.io';
import logger from '../common/utils/logger.js';

// Keep reference to io instance; set once during app bootstrap
let _io: Server | null = null;

export function setSocketIO(io: Server) {
  _io = io;
}

export function getSocketIO(): Server | null {
  return _io;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type NotificationType =
  | 'join_request'
  | 'message'
  | 'system'
  | 'notice'
  | 'friend_request'
  | 'friend_accept'
  | 'like'
  | 'mention'
  | 'comment'
  | 'admin_alert'
  | 'role_change'
  | 'account_action'
  | 'reminder'
  | 'form'
  | 'permission'
  | 'report';

export interface CreateNotificationInput {
  recipientId: string;
  senderId?: string | null;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, any>;
}

export interface BulkNotificationInput {
  recipientIds: string[];
  senderId?: string | null;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, any>;
}

export interface RoleNotificationInput {
  roles: string[];
  senderId?: string | null;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, any>;
}

// ─── Core ────────────────────────────────────────────────────────────────────

/**
 * Send a notification to a single user.
 */
export async function notify(input: CreateNotificationInput) {
  try {
    const notification = await prisma.notification.create({
      data: {
        recipientId: input.recipientId,
        senderId: input.senderId ?? null,
        type: input.type as any,
        title: input.title,
        message: input.message,
        data: input.data ?? undefined,
      },
      include: {
        sender: { select: { id: true, name: true, image: true } },
      },
    });

    // Real-time push to recipient's room
    if (_io) {
      _io.to(input.recipientId).emit('notification', notification);
    }

    return notification;
  } catch (err) {
    logger.error({ err, input }, 'Failed to create notification');
    return null;
  }
}

/**
 * Send a notification to multiple users.
 */
export async function notifyMany(input: BulkNotificationInput) {
  try {
    const { recipientIds, senderId, type, title, message, data } = input;

    if (recipientIds.length === 0) return [];

    // Batch create
    await prisma.notification.createMany({
      data: recipientIds.map((recipientId) => ({
        recipientId,
        senderId: senderId ?? null,
        type: type as any,
        title,
        message,
        data: data ?? undefined,
      })),
    });

    // Fetch the created notifications for real-time delivery
    const notifications = await prisma.notification.findMany({
      where: {
        recipientId: { in: recipientIds },
        type: type as any,
        title,
        senderId: senderId ?? null,
      },
      include: {
        sender: { select: { id: true, name: true, image: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: recipientIds.length,
    });

    // Real-time push to each recipient
    if (_io) {
      for (const n of notifications) {
        _io.to(n.recipientId).emit('notification', n);
      }
    }

    return notifications;
  } catch (err) {
    logger.error({ err, input }, 'Failed to send bulk notifications');
    return [];
  }
}

/**
 * Send a notification to all users with specific roles.
 */
export async function notifyByRoles(input: RoleNotificationInput) {
  try {
    const users = await prisma.user.findMany({
      where: { role: { in: input.roles as any[] } },
      select: { id: true },
    });

    return notifyMany({
      recipientIds: users.map((u) => u.id),
      senderId: input.senderId,
      type: input.type,
      title: input.title,
      message: input.message,
      data: input.data,
    });
  } catch (err) {
    logger.error({ err, input }, 'Failed to send role-based notifications');
    return [];
  }
}

/**
 * Send a notification to ALL users.
 */
export async function notifyAll(input: Omit<BulkNotificationInput, 'recipientIds'>) {
  try {
    const users = await prisma.user.findMany({ select: { id: true } });
    return notifyMany({
      ...input,
      recipientIds: users.map((u) => u.id),
    });
  } catch (err) {
    logger.error({ err, input }, 'Failed to send notification to all users');
    return [];
  }
}
