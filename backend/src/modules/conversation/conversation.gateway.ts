import { Server, Socket } from 'socket.io';
import logger from '../../common/utils/logger.js';
import prisma from '../../config/database.js';
import { resetUnreadRequestCount } from './conversation.controller.js';

export class ConversationGateway {
  private io: Server;
  private activeUsers = new Map<string, Map<string, any>>();

  constructor(io: Server) {
    this.io = io;
  }

  handleConnection(socket: Socket) {
    socket.on('joinRoom', (id: string) => this.handleJoinConversation(socket, id));
    socket.on('leaveRoom', (id: string) => this.handleLeaveConversation(socket, id));
    socket.on('join:conversation', (id: string) => this.handleJoinConversation(socket, id));
    socket.on('conversation:join', (id: string) => this.handleJoinConversation(socket, id));
    socket.on('leave:conversation', (id: string) => this.handleLeaveConversation(socket, id));
    socket.on('conversation:leave', (id: string) => this.handleLeaveConversation(socket, id));
    socket.on('conversation:getActiveUsers', (id: string) => this.handleGetActiveUsers(socket, id));
    socket.on('conversation:active-users', (id: string) => this.handleGetActiveUsers(socket, id));
    socket.on('reset_unread_request', (type: string) => this.handleResetUnreadRequest(socket, type));
  }

  async handleJoinConversation(socket: Socket, conversationId: string) {
    const userId = (socket as any).user?.id;
    socket.join(`conv:${conversationId}`);

    if (!this.activeUsers.has(conversationId)) this.activeUsers.set(conversationId, new Map());
    const userData = {
      id: (socket as any).user?.id,
      name: (socket as any).user?.name,
      email: (socket as any).user?.email,
      image: (socket as any).user?.image,
    };
    this.activeUsers.get(conversationId)!.set(userId, userData);

    const activeUsersMap = this.activeUsers.get(conversationId) ?? new Map();
    const activeUsersList = Array.from(activeUsersMap.values());
    this.io.to(`conv:${conversationId}`).emit('conversation:userJoined', { conversationId, userId, activeUsers: activeUsersList });
    this.io.to(`conv:${conversationId}`).emit('activeUsersUpdate', activeUsersList);
    logger.info({ socketId: socket.id, userId, conversationId }, 'User joined conversation');
  }

  handleLeaveConversation(socket: Socket, conversationId: string) {
    const userId = (socket as any).user?.id;
    socket.leave(`conv:${conversationId}`);

    if (this.activeUsers.has(conversationId)) {
      this.activeUsers.get(conversationId)!.delete(userId);
      if (this.activeUsers.get(conversationId)!.size === 0) this.activeUsers.delete(conversationId);
    }

    const activeUsersList = this.activeUsers.has(conversationId)
      ? Array.from(this.activeUsers.get(conversationId)!.values())
      : [];
    this.io.to(`conv:${conversationId}`).emit('conversation:userLeft', { conversationId, userId, activeUsers: activeUsersList });
    this.io.to(`conv:${conversationId}`).emit('activeUsersUpdate', activeUsersList);
  }

  handleGetActiveUsers(socket: Socket, conversationId: string) {
    const activeUsers = this.activeUsers.has(conversationId)
      ? Array.from(this.activeUsers.get(conversationId)!.values())
      : [];
    socket.emit('conversation:activeUsers', { conversationId, activeUsers });
    socket.emit('activeUsersUpdate', activeUsers);
  }

  async handleResetUnreadRequest(socket: Socket, requestType: string) {
    const userId = (socket as any).user?.id;
    if (!userId) return;
    try {
      const updatedCounts = await resetUnreadRequestCount(userId, requestType);
      socket.emit('unread_counts_updated', updatedCounts);
    } catch (error) {
      logger.error({ error, userId, requestType }, 'Error resetting unread request count');
      socket.emit('error', { message: 'Failed to reset unread request count' });
    }
  }

  handleDisconnect(socket: Socket, _reason?: string) {
    const userId = (socket as any).user?.id;
    this.activeUsers.forEach((users, conversationId) => {
      if (users.has(userId)) {
        users.delete(userId);
        const activeUsersList = Array.from(users.values());
        this.io.to(`conv:${conversationId}`).emit('conversation:userLeft', { conversationId, userId, activeUsers: activeUsersList });
        this.io.to(`conv:${conversationId}`).emit('activeUsersUpdate', activeUsersList);
        if (users.size === 0) this.activeUsers.delete(conversationId);
      }
    });
  }
}
