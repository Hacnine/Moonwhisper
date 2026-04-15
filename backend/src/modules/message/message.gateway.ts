import {
  sendTextMessage,
  markMessagesAsRead,
  markMessagesAsDelivered,
  deleteMessage,
  editMessageCore,
  addReaction,
  removeReaction,
  sendEmojiCore,
} from './message.controller.js';
import logger from '../../common/utils/logger.js';
import prisma from '../../config/database.js';
import type { Server, Socket } from 'socket.io';
import type { IGateway } from '../../common/socket/gateway.manager.js';

const userSockets = new Map<string, Set<string>>();

const getUserConversations = async (userId: string): Promise<string[]> => {
  try {
    const participants = await prisma.conversationParticipant.findMany({
      where: { userId },
      select: { conversationId: true },
    });
    return participants.map((p: any) => p.conversationId);
  } catch (error) {
    logger.error({ error, userId }, 'Error fetching user conversations');
    return [];
  }
};

const joinUserToAllConversations = async (socket: Socket, userId: string) => {
  const conversationIds = await getUserConversations(userId);
  for (const convId of conversationIds) {
    socket.join(`conv:${convId}`);
    socket.join(convId);
  }
  socket.join(`user_${userId}`);
  logger.info({ socketId: socket.id, userId, conversationCount: conversationIds.length }, 'User auto-joined to all conversation rooms');
  return conversationIds;
};

export const emitMessageToConversationParticipants = async (io: Server, conversationId: string, eventName: string, data: any) => {
  try {
    const participants = await prisma.conversationParticipant.findMany({
      where: { conversationId },
      select: { userId: true },
    });

    for (const p of participants) {
      io.to(`user_${p.userId}`).emit(eventName, { ...data, conversationId });
    }
    io.to(`conv:${conversationId}`).emit(eventName, data);
    io.to(conversationId).emit(eventName, data);
  } catch (error) {
    logger.error({ error, conversationId, eventName }, 'Error emitting message to participants');
  }
};

export class MessageGateway implements IGateway {
  constructor(private io: Server) {}

  async handleConnection(socket: Socket) {
    const userId = (socket as any).user?.id;
    if (userId) {
      await joinUserToAllConversations(socket, userId);
      if (!userSockets.has(userId)) userSockets.set(userId, new Set());
      userSockets.get(userId)!.add(socket.id);
    }

    socket.on('joinRoom', (convId: string) => this.handleJoinRoom(socket, convId));
    socket.on('message:joinRoom', (convId: string) => this.handleJoinRoom(socket, convId));
    socket.on('refreshConversationRooms', async () => {
      if (userId) { await joinUserToAllConversations(socket, userId); socket.emit('conversationRoomsRefreshed'); }
    });
    socket.on('typing', (data: any) => this.handleTyping(socket, data));
    socket.on('message:typing', (data: any) => this.handleTyping(socket, data));
    socket.on('sendMessage', (data: any) => this.handleSendMessage(socket, data));
    socket.on('message:send', (data: any) => this.handleSendMessage(socket, data));
    socket.on('sendEmoji', (data: any) => this.handleSendEmoji(socket, data));
    socket.on('message:sendEmoji', (data: any) => this.handleSendEmoji(socket, data));
    socket.on('messageRead', (data: any) => this.handleMessageRead(socket, data));
    socket.on('message:read', (data: any) => this.handleMessageRead(socket, data));
    socket.on('messageDelivered', (data: any) => this.handleMessageDelivered(socket, data));
    socket.on('message:delivered', (data: any) => this.handleMessageDelivered(socket, data));
    socket.on('deleteMessage', (data: any) => this.handleDeleteMessage(socket, data));
    socket.on('message:delete', (data: any) => this.handleDeleteMessage(socket, data));
    socket.on('editMessage', (data: any) => this.handleEditMessage(socket, data));
    socket.on('message:edit', (data: any) => this.handleEditMessage(socket, data));
    socket.on('addReaction', (data: any) => this.handleAddReaction(socket, data));
    socket.on('message:react', (data: any) => this.handleAddReaction(socket, data));
    socket.on('removeReaction', (data: any) => this.handleRemoveReaction(socket, data));
    socket.on('message:unreact', (data: any) => this.handleRemoveReaction(socket, data));
    socket.on('replyMessage', (data: any) => this.handleReplyMessage(socket, data));
    socket.on('message:reply', (data: any) => this.handleReplyMessage(socket, data));
  }

  handleDisconnect(socket: Socket) {
    const userId = (socket as any).user?.id;
    if (userId && userSockets.has(userId)) {
      userSockets.get(userId)!.delete(socket.id);
      if (userSockets.get(userId)!.size === 0) userSockets.delete(userId);
    }
  }

  private handleJoinRoom(socket: Socket, conversationId: string) {
    socket.join(conversationId);
  }

  private handleTyping(socket: Socket, { conversationId, userId, isTyping }: any) {
    this.io.to(conversationId).emit('typing', { userId, isTyping });
  }

  private async handleSendMessage(socket: Socket, { conversationId, sender, receiver, text, clientTempId }: any) {
    if (!sender) { socket.emit('sendMessageError', { message: 'Invalid sender', clientTempId }); return; }
    await sendTextMessage({ io: this.io, socket, conversationId, sender, receiver, text, clientTempId });
  }

  private async handleSendEmoji(socket: Socket, { conversationId, sender, receiver, data, clientTempId }: any) {
    if (!sender || !data) { socket.emit('sendMessageError', { message: 'Invalid sender or data', clientTempId }); return; }
    try {
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      const { text, htmlEmoji, emojiType, mediaUrl } = parsed;

      const result = await sendEmojiCore({
        sender, receiver, conversationId, text, htmlEmoji, emojiType, mediaUrl, clientTempId,
      });

      if (!result.success) {
        socket.emit('sendMessageError', { message: result.message, clientTempId });
        return;
      }

      // Emit to all participants
      await emitMessageToConversationParticipants(this.io, result.conversationId, 'receiveMessage', result.message);
      socket.emit('sendMessageSuccess', { ...result, clientTempId });
    } catch (error: any) {
      socket.emit('sendMessageError', { message: 'Server error', clientTempId });
    }
  }

  private async handleMessageRead(_socket: Socket, { conversationId, userId }: any) {
    await markMessagesAsRead(conversationId, userId, this.io);
  }

  private async handleMessageDelivered(_socket: Socket, { conversationId, userId }: any) {
    await markMessagesAsDelivered(conversationId, userId, this.io);
  }

  private async handleDeleteMessage(socket: Socket, { messageId, userId }: any) {
    await deleteMessage({ io: this.io, socket, messageId, userId });
  }

  private async handleEditMessage(socket: Socket, { messageId, text, htmlEmoji, emojiType, clientTempId }: any) {
    const userId = (socket as any).user?.id;
    const result = await editMessageCore({ messageId, sender: userId, text, htmlEmoji, emojiType, clientTempId });
    if (!result.success) { socket.emit('editMessageError', { message: result.message, clientTempId }); return; }
    this.io.to(result.conversationId!).emit('messageEdited', result.message);
    socket.emit('editMessageSuccess', { message: result.message, clientTempId });
  }

  private async handleAddReaction(socket: Socket, { conversationId, messageId, userId, emoji }: any) {
    const uid = userId || (socket as any).user?.id;
    const result = await addReaction({ conversationId, messageId, userId: uid, emoji });
    if (result.success && conversationId) {
      const allReactions = await prisma.messageReaction.findMany({ where: { messageId } });
      // Frontend expects { [userId]: { emoji, username } } objects (matches old code)
      const reactions: Record<string, { emoji: string; username: string }> = {};
      for (const r of allReactions) reactions[r.userId] = { emoji: r.emoji, username: r.username };
      this.io.to(conversationId).emit('reactionUpdate', { messageId, reactions });
      socket.emit('reactionSuccess', { messageId, reactions });
    }
  }

  private async handleRemoveReaction(socket: Socket, { conversationId, messageId, userId }: any) {
    const uid = userId || (socket as any).user?.id;
    const result = await removeReaction({ conversationId, messageId, userId: uid });
    if (result.success && conversationId) {
      const allReactions = await prisma.messageReaction.findMany({ where: { messageId } });
      // Frontend expects { [userId]: { emoji, username } } objects (matches old code)
      const reactions: Record<string, { emoji: string; username: string }> = {};
      for (const r of allReactions) reactions[r.userId] = { emoji: r.emoji, username: r.username };
      this.io.to(conversationId).emit('reactionUpdate', { messageId, reactions });
      socket.emit('reactionSuccess', { messageId, reactions });
    }
  }

  private async handleReplyMessage(socket: Socket, { conversationId, messageId, text, clientTempId }: any) {
    const sender = (socket as any).user?.id;
    if (!conversationId || !messageId) { socket.emit('replyMessageError', { message: 'Missing fields', clientTempId }); return; }
    // Use sendTextMessage with replyToId
    await sendTextMessage({ io: this.io, socket, conversationId, sender, receiver: undefined, text, clientTempId, replyToId: messageId });
  }
}
