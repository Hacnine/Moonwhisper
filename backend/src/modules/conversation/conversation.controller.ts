import { Request, Response } from 'express';
import prisma from '../../config/database.js';
import { formatConversationDetail, formatConversationList } from './conversation.utils.js';

export const createConversation = async (req: Request, res: Response) => {
  try {
    const senderId = (req as any).user?.id;
    const raw = req.body.receiverId;
    // Accept both a plain ID string and an object with an `id` property
    const receiverId = raw && typeof raw === 'object' ? raw.id : raw;

    if (!senderId || !receiverId || typeof receiverId !== 'string') {
      return res.status(400).json({ message: 'receiverId must be a valid user ID' });
    }

    // Check existing conversation between the two users
    const existing = await prisma.conversation.findFirst({
      where: {
        AND: [
          { participants: { some: { userId: senderId } } },
          { participants: { some: { userId: receiverId } } },
        ],
        isGroup: false,
      },
      include: { participants: true },
    });

    if (existing) {
      const full = await prisma.conversation.findUnique({
        where: { id: existing.id },
        include: {
          participants: { include: { user: { select: { id: true, name: true, image: true } } } },
          admins: { include: { user: { select: { id: true, name: true, image: true } } } },
          moderators: { include: { user: { select: { id: true, name: true, image: true } } } },
          blockList: true,
          selectedDays: true,
        },
      });
      return res.status(200).json(formatConversationDetail(full!, senderId));
    }

    const conv = await prisma.conversation.create({
      data: {
        participants: {
          create: [{ userId: senderId }, { userId: receiverId }],
        },
      },
      include: {
        participants: { include: { user: { select: { id: true, name: true, image: true } } } },
        admins: { include: { user: { select: { id: true, name: true, image: true } } } },
        moderators: { include: { user: { select: { id: true, name: true, image: true } } } },
        blockList: true,
        selectedDays: true,
      },
    });

    res.status(201).json(formatConversationDetail(conv, senderId));
  } catch (error: any) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const getAllConversations = async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId as string;

    const conversations = await prisma.conversation.findMany({
      where: { participants: { some: { userId } } },
      include: {
        participants: { include: { user: { select: { id: true, name: true, image: true } } } },
        unreadEntries: { where: { userId } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 30,
    });

    const formatted = conversations.map((conv: any) => formatConversationList(conv, userId));
    res.json(formatted);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const searchGroups = async (req: Request, res: Response) => {
  try {
    const { query, page = '1', limit = '10' } = req.query as Record<string, string>;
    const currentUserId = (req as any).user.id;

    if (!query) return res.status(400).json({ error: 'Query parameter is required' });

    if (!/^[a-zA-Z0-9._%+\-@ ]*$/.test(query)) {
      return res.status(400).json({ error: 'Invalid query characters' });
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    const [total, conversations] = await Promise.all([
      prisma.conversation.count({
        where: {
          isGroup: true,
          groupType: 'group',
          visibility: 'public',
          groupName: { contains: query },
          participants: { none: { userId: currentUserId } },
        },
      }),
      prisma.conversation.findMany({
        where: {
          isGroup: true,
          groupType: 'group',
          visibility: 'public',
          groupName: { contains: query },
          participants: { none: { userId: currentUserId } },
        },
        select: {
          id: true, groupName: true, groupImage: true, groupIntro: true, groupType: true,
          participants: { select: { userId: true } },
        },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
    ]);

    const groups = conversations.map((c: any) => ({
      id: c.id,
      name: c.groupName || 'Unnamed Group',
      image: c.groupImage || null,
      intro: c.groupIntro || 'N/A',
      type: c.groupType || 'group',
      members: c.participants.length,
    }));

    res.status(200).json({ groups, total, page: pageNum, totalPages: Math.ceil(total / limitNum) });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createGroup = async (req: Request, res: Response) => {
  try {
    const { name, intro, image, visibility = 'public' } = req.body;
    const creatorId = (req as any).user.id;

    if (!name?.trim()) return res.status(400).json({ message: 'Group name is required' });

    if (!['public', 'private'].includes(visibility)) {
      return res.status(400).json({ message: "Visibility must be 'public' or 'private'" });
    }

    const group = await prisma.conversation.create({
      data: {
        isGroup: true,
        groupType: 'group',
        groupName: name.trim(),
        groupIntro: intro?.trim(),
        groupImage: image?.trim(),
        visibility,
        participants: { create: [{ userId: creatorId }] },
        admins: { create: [{ userId: creatorId }] },
      },
      include: {
        participants: { include: { user: { select: { id: true, name: true, email: true, image: true } } } },
        admins: { include: { user: { select: { id: true, name: true, email: true, image: true } } } },
      },
    });

    res.status(201).json({ message: 'Group created successfully', group });
  } catch (error: any) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const getConversationById = async (req: Request, res: Response) => {
  try {
    const chatId = req.params.chatId as string;
    const { userId } = req.query as { userId?: string };

    if (!chatId || !userId) return res.status(400).json({ message: 'Invalid chat ID' });

    const conversation = await prisma.conversation.findUnique({
      where: { id: chatId },
      include: {
        participants: { include: { user: { select: { id: true, name: true, image: true } } } },
        admins: { include: { user: { select: { id: true, name: true, image: true } } } },
        moderators: { include: { user: { select: { id: true, name: true, image: true } } } },
        blockList: true,
        selectedDays: true,
      },
    });

    if (!conversation) return res.status(404).json({ message: 'Conversation not found' });

    const isParticipant = conversation.participants.some((p) => p.userId === userId);
    if (!isParticipant) return res.status(403).json({ message: 'Access denied' });

    res.json(formatConversationDetail(conversation, userId));
  } catch (error) {
    res.status(500).json({ message: 'Failed to get conversation info' });
  }
};

export const getUnreadRequestCounts = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    let unreadCount = await prisma.unreadCount.findUnique({ where: { userId } });
    if (!unreadCount) {
      unreadCount = await prisma.unreadCount.create({
        data: { userId, unreadFriendRequestCount: 0, unreadGroupRequestCount: 0 },
      });
    }

    res.status(200).json({
      unreadFriendRequestCount: unreadCount.unreadFriendRequestCount,
      unreadGroupRequestCount: unreadCount.unreadGroupRequestCount,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const resetUnreadRequestCount = async (userId: string, requestType: string) => {
  const fieldMap: Record<string, string> = {
    friend: 'unreadFriendRequestCount',
    group: 'unreadGroupRequestCount',
  };
  const fieldName = fieldMap[requestType];
  if (!fieldName) throw new Error('Invalid request type');

  const updated = await prisma.unreadCount.upsert({
    where: { userId },
    create: { userId, [fieldName]: 0 },
    update: { [fieldName]: 0 },
  });

  return {
    unreadFriendRequestCount: updated.unreadFriendRequestCount,
    unreadGroupRequestCount: updated.unreadGroupRequestCount,
  };
};

export const acceptMessageRequest = async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.conversationId as string;
    const { status } = req.body;
    const userId = (req as any).user.id;

    if (!conversationId) return res.status(400).json({ message: 'Invalid conversation ID' });
    if (status !== 'accepted') return res.status(400).json({ message: 'Invalid status update' });

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { participants: { orderBy: { id: 'asc' } } },
    });
    if (!conversation) return res.status(404).json({ message: 'Conversation not found' });

    // Must be the receiver (not the user who sent the first message)
    const isParticipant = conversation.participants.some((p) => p.userId === userId);
    const requestCreatorId = conversation.lastMessageSenderId || conversation.participants[0]?.userId;
    const isCreator = requestCreatorId === userId;
    if (!isParticipant || isCreator) {
      return res.status(403).json({ message: 'Not authorized to accept this request' });
    }
    if (conversation.status === 'accepted') return res.status(400).json({ message: 'Already accepted' });

    await prisma.conversation.update({ where: { id: conversationId }, data: { status: 'accepted' } });

    // Add friends
    const [userA, userB] = conversation.participants.map((p) => p.userId);
    await prisma.friendEntry.createMany({
      data: [
        { friendListId: (await prisma.friendList.upsert({ where: { userId: userA }, create: { userId: userA }, update: {} })).id, friendId: userB },
        { friendListId: (await prisma.friendList.upsert({ where: { userId: userB }, create: { userId: userB }, update: {} })).id, friendId: userA },
      ],
      skipDuplicates: true,
    });

    const participantIds = conversation.participants.map((p) => p.userId);
    participantIds.forEach((pid) => {
      (req as any).io?.to(pid).emit('messageRequestAccepted', { conversationId, message: 'Message request accepted' });
    });

    // Fetch full conversation with populated participants
    const fullConversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: {
          include: {
            user: {
              select: { id: true, name: true, email: true, image: true },
            },
          },
        },
      },
    });

    res.status(200).json({ message: 'Message request accepted', conversation: fullConversation });
  } catch (error: any) {
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const updateConversationThemeIndex = async (req: Request, res: Response) => {
  try {
    const { themeIndex } = req.body;
    const id = req.params.id as string;

    const existing = await prisma.conversation.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'Conversation not found' });

    const conversation = await prisma.conversation.update({ where: { id }, data: { themeIndex } });
    res.json({ message: 'Theme index updated', themeIndex: conversation.themeIndex });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteConversation = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.conversation.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'Conversation not found.' });
    await prisma.conversation.delete({ where: { id } });
    res.status(200).json({ message: 'Conversation deleted successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error. Could not delete conversation.' });
  }
};

export const updateDisappearingMessages = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { autoDeleteMessagesAfter } = req.body;
    const userId = (req as any).user.id;

    if (autoDeleteMessagesAfter === undefined || typeof autoDeleteMessagesAfter !== 'number' || autoDeleteMessagesAfter < 0) {
      return res.status(400).json({ message: 'autoDeleteMessagesAfter must be a positive number (hours).' });
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: { participants: true },
    });
    if (!conversation) return res.status(404).json({ message: 'Conversation not found.' });

    const isParticipant = conversation.participants.some((p) => p.userId === userId);
    if (!isParticipant) return res.status(403).json({ message: 'Not a participant.' });

    await prisma.conversation.update({ where: { id }, data: { autoDeleteMessagesAfter } });

    (req as any).io?.to(id).emit('disappearingMessagesUpdated', { conversationId: id, autoDeleteMessagesAfter, updatedBy: userId });

    res.status(200).json({ message: 'Disappearing messages setting updated.', autoDeleteMessagesAfter });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

export const getDisappearingMessages = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user.id;

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: { participants: true },
    });
    if (!conversation) return res.status(404).json({ message: 'Conversation not found.' });

    const isParticipant = conversation.participants.some((p) => p.userId === userId);
    if (!isParticipant) return res.status(403).json({ message: 'Not a participant.' });

    res.status(200).json({ autoDeleteMessagesAfter: conversation.autoDeleteMessagesAfter || 24 });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

export const getPendingConversationRequests = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    const conversations = await prisma.conversation.findMany({
      where: {
        participants: { some: { userId } },
        status: 'pending',
        isGroup: false,
      },
      include: {
        participants: {
          include: { user: { select: { id: true, name: true, image: true } } },
          orderBy: { id: 'asc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const formatted = conversations.map((c: any) => {
      const other = c.participants.find((p: any) => p.userId !== userId);
      const isRequestor = (c.lastMessageSenderId ?? c.participants[0]?.userId) === userId;
      const accepter = c.participants.find((p: any) => p.userId !== c.lastMessageSenderId)?.userId
        ?? c.participants[1]?.userId;
      const response: any = {
        accepter,
        conversationId: c.id,
        name: other?.user?.name || null,
        image: other?.user?.image || null,
      };
      if (isRequestor) response.status = c.status;
      return response;
    });

    const totalConversations = await prisma.conversation.count({
      where: { participants: { some: { userId } }, status: 'pending', isGroup: false },
    });

    res.json({ conversations: formatted, totalConversations, page, limit });
  } catch (error: any) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const getGroupJoinRequests = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 15;

    res.json({ groups: [], totalRequests: 0, page, limit });
  } catch (error: any) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const updateGroupImage = async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.conversationId as string;
    const { image } = req.body;
    const userId = (req as any).user.id;

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { admins: true },
    });
    if (!conversation) return res.status(404).json({ message: 'Conversation not found' });
    if (!conversation.isGroup) return res.status(400).json({ message: 'Not a group' });

    const isAdmin = conversation.admins.some((a) => a.userId === userId);
    if (!isAdmin) return res.status(403).json({ message: 'Only admins can update group image' });

    const updated = await prisma.conversation.update({
      where: { id: conversationId },
      data: { groupImage: image.trim() },
      include: { participants: { include: { user: true } }, admins: { include: { user: true } } },
    });

    res.json({ message: 'Group image updated', group: updated });
  } catch (error: any) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const leaveConversation = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user.id;

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: { participants: true, admins: true },
    });
    if (!conversation) return res.status(404).json({ message: 'Conversation not found.' });
    if (!conversation.isGroup) return res.status(400).json({ message: 'Cannot leave one-to-one conversation.' });

    const isParticipant = conversation.participants.some((p) => p.userId === userId);
    if (!isParticipant) return res.status(403).json({ message: 'Not a participant.' });

    await prisma.conversationParticipant.deleteMany({ where: { conversationId: id, userId } });
    await prisma.conversationAdmin.deleteMany({ where: { conversationId: id, userId } });

    const remaining = await prisma.conversationParticipant.findMany({
      where: { conversationId: id },
      select: { userId: true },
    });
    (req as any).io?.to(id).emit('conversation:userLeft', { conversationId: id, userId, participants: remaining.map((p) => p.userId) });

    res.status(200).json({ message: 'Successfully left the conversation.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};
