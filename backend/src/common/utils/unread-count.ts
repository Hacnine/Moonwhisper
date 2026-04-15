import prisma from '../../config/database.js';
import { Server } from 'socket.io';

export const incrementUnreadRequest = async (
  userId: string,
  type: 'friend' | 'group',
  io: Server | null = null
) => {
  const fieldMap: Record<string, string> = {
    friend: 'unreadFriendRequestCount',
    group: 'unreadGroupRequestCount',
  };

  const field = fieldMap[type];
  if (!field) throw new Error(`Invalid request type: ${type}`);

  const unreadCount = await prisma.unreadCount.upsert({
    where: { userId },
    create: { userId, [field]: 1 },
    update: { [field]: { increment: 1 } },
  });

  const counts = {
    unreadFriendRequestCount: unreadCount.unreadFriendRequestCount,
    unreadGroupRequestCount: unreadCount.unreadGroupRequestCount,
  };

  if (io) {
    io.to(userId).emit('unread_counts_updated', counts);
  }

  return counts;
};

export const resetUnreadRequests = async (
  userId: string,
  type: 'friend' | 'group'
) => {
  const fieldMap: Record<string, string> = {
    friend: 'unreadFriendRequestCount',
    group: 'unreadGroupRequestCount',
  };

  const field = fieldMap[type];
  if (!field) throw new Error(`Invalid request type: ${type}`);

  return await prisma.unreadCount.upsert({
    where: { userId },
    create: { userId, [field]: 0 },
    update: { [field]: 0 },
  });
};

export const incrementUnreadMessage = async (
  userId: string,
  conversationId: string
) => {
  const unreadCount = await prisma.unreadCount.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });

  const existingUnread = await prisma.unreadMessage.findUnique({
    where: {
      unreadCountId_conversationId: {
        unreadCountId: unreadCount.id,
        conversationId,
      },
    },
  });

  if (existingUnread) {
    await prisma.unreadMessage.update({
      where: { id: existingUnread.id },
      data: { count: { increment: 1 } },
    });
  } else {
    await prisma.unreadMessage.create({
      data: {
        unreadCountId: unreadCount.id,
        userId: unreadCount.userId,
        conversationId,
        count: 1,
      },
    });
  }
};

export const resetUnreadMessages = async (
  userId: string,
  conversationId: string
) => {
  const unreadCount = await prisma.unreadCount.findUnique({
    where: { userId },
  });

  if (!unreadCount) return null;

  await prisma.unreadMessage.updateMany({
    where: {
      unreadCountId: unreadCount.id,
      conversationId,
    },
    data: { count: 0 },
  });
};

export const decrementUnreadMessage = async (
  userId: string,
  conversationId: string
) => {
  const unreadCount = await prisma.unreadCount.findUnique({
    where: { userId },
  });

  if (!unreadCount) return null;

  const unreadMsg = await prisma.unreadMessage.findUnique({
    where: {
      unreadCountId_conversationId: {
        unreadCountId: unreadCount.id,
        conversationId,
      },
    },
  });

  if (unreadMsg && unreadMsg.count > 0) {
    await prisma.unreadMessage.update({
      where: { id: unreadMsg.id },
      data: { count: { decrement: 1 } },
    });
  }
};
