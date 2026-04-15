import { Server, Socket } from 'socket.io';
import logger from '../../common/utils/logger.js';

export const onlineUsers = new Map<string, { socketIds: Set<string>; userData: any }>();

export class UserGateway {
  private io: Server;

  constructor(io: Server) {
    this.io = io;
  }

  handleConnection(socket: Socket) {
    const userId = (socket as any).user?.id;
    if (userId) this.handleUserOnline(socket, userId);

    socket.on('userOnline', (uid: string) => this.handleUserOnline(socket, uid));
    socket.on('user:online', (uid: string) => this.handleUserOnline(socket, uid));
    socket.on('user:getStatus', (data: any) => this.handleGetUserStatus(socket, data));
    socket.on('user:status', (data: any) => this.handleGetUserStatus(socket, data));
  }

  handleUserOnline(socket: Socket, userId?: string) {
    if (!userId) userId = (socket as any).user?.id;
    if (!userId) return;

    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, { socketIds: new Set(), userData: (socket as any).user });
    }
    onlineUsers.get(userId)!.socketIds.add(socket.id);

    this.io.emit('userOnline', { userId });
    this.io.emit('user:online', { userId });
    logger.info({ socketId: socket.id, userId }, 'User online');
  }

  handleUserOffline(socket: Socket, userId?: string) {
    if (!userId) userId = (socket as any).user?.id;
    if (!userId) return;

    if (onlineUsers.has(userId)) {
      onlineUsers.get(userId)!.socketIds.delete(socket.id);
      if (onlineUsers.get(userId)!.socketIds.size === 0) {
        onlineUsers.delete(userId);
        this.io.emit('userOffline', { userId });
        this.io.emit('user:offline', { userId });
        logger.info({ socketId: socket.id, userId }, 'User offline');
      }
    }
  }

  handleGetUserStatus(socket: Socket, { userId }: { userId: string }) {
    const isOnline = onlineUsers.has(userId);
    socket.emit('user:status', {
      userId,
      isOnline,
      socketCount: isOnline ? onlineUsers.get(userId)!.socketIds.size : 0,
    });
  }

  handleDisconnect(socket: Socket, _reason?: string) {
    this.handleUserOffline(socket);
  }

  getOnlineUsers() {
    return Array.from(onlineUsers.keys());
  }

  isUserOnline(userId: string) {
    return onlineUsers.has(userId);
  }
}
