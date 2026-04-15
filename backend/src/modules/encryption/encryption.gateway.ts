/**
 * Encryption Gateway (ported from backend-old)
 * Handles end-to-end encryption key exchange socket events.
 *
 * Events handled:
 *  encryption:exchange-key    – Store / update user's public key for a conversation
 *  encryption:regenerate-key  – Same as exchange-key (alias)
 *  encryption:fetch-keys      – Return all OTHER participants' public keys
 *  encryption:verify-key      – Check whether the requesting user already has a key stored
 *  encryption:key-generated   – Broadcast a newly-generated key to the rest of the room
 */

import { Server, Socket } from 'socket.io';
import logger from '../../common/utils/logger.js';
import prisma from '../../config/database.js';

interface KeyData {
  publicKey: string;
  keyId: string;
  keyVersion: number;
  exchangedAt: string;
  isActive: boolean;
}

type KeyExchangeParticipants = Record<string, KeyData>;

export class EncryptionGateway {
  private io: Server;

  constructor(io: Server) {
    this.io = io;
  }

  handleConnection(socket: Socket) {
    socket.on('encryption:exchange-key', (data: any, cb?: any) =>
      this.handleExchangeKey(socket, data, cb)
    );
    socket.on('encryption:regenerate-key', (data: any, cb?: any) =>
      this.handleExchangeKey(socket, data, cb)
    );
    socket.on('encryption:fetch-keys', (data: any, cb?: any) =>
      this.handleFetchKeys(socket, data, cb)
    );
    socket.on('encryption:verify-key', (data: any, cb?: any) =>
      this.handleVerifyKey(socket, data, cb)
    );
    socket.on('encryption:key-generated', (data: any) =>
      this.handleKeyGenerated(socket, data)
    );
  }

  /**
   * Exchange / update the calling user's public key for a conversation,
   * then broadcast to all other participants in the room.
   */
  private async handleExchangeKey(
    socket: Socket,
    { conversationId, publicKey }: { conversationId: string; publicKey: string },
    callback?: Function
  ) {
    try {
      const userId = (socket as any).user?.id;
      if (!userId) throw new Error('Unauthenticated socket');

      if (!conversationId || conversationId === 'empty') {
        if (typeof callback === 'function') {
          callback({ success: false, message: 'Invalid conversation ID' });
        }
        return;
      }

      if (!publicKey || typeof publicKey !== 'string') {
        if (typeof callback === 'function') {
          callback({ success: false, message: 'Public key is required and must be a string' });
        }
        return;
      }

      // Verify participant
      const participant = await prisma.conversationParticipant.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
      });
      if (!participant) {
        if (typeof callback === 'function') {
          callback({ success: false, message: 'You are not a participant of this conversation' });
        }
        return;
      }

      // Fetch current keyExchangeData
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { participants: true },
      });
      if (!conversation) {
        if (typeof callback === 'function') {
          callback({ success: false, message: 'Conversation not found' });
        }
        return;
      }

      const participants: KeyExchangeParticipants =
        (conversation.keyExchangeData as unknown as KeyExchangeParticipants) || {};

      const existingKey = participants[userId];
      const keyVersion = existingKey ? existingKey.keyVersion + 1 : 1;
      const keyId = `key_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      participants[userId] = {
        publicKey,
        keyId,
        keyVersion,
        exchangedAt: new Date().toISOString(),
        isActive: true,
      };

      const totalParticipants = conversation.participants.length;
      const exchangedCount = Object.keys(participants).length;
      const status = exchangedCount >= totalParticipants ? 'complete' : 'partial';

      await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          keyExchangeData: participants as any,
          keyExchangeStatus: status,
          keyExchangeCreatedAt: conversation.keyExchangeCreatedAt || new Date(),
          keyExchangeLastActivity: new Date(),
        },
      });

      const savedKeyData = { conversationId, keyId, keyVersion, exchangeStatus: status, participantsWithKeys: exchangedCount, totalParticipants };

      // Broadcast to room so other participants can store the new key
      socket.to(conversationId).emit('encryption:key-exchanged', {
        conversationId,
        userId,
        publicKey,
        keyId,
        keyVersion,
      });
      // Also try the prefixed room name used by some frontends
      socket.to(`conv:${conversationId}`).emit('encryption:key-exchanged', {
        conversationId,
        userId,
        publicKey,
        keyId,
        keyVersion,
      });

      logger.debug({ userId, conversationId, keyId, keyVersion }, 'Encryption key exchanged and saved');

      if (typeof callback === 'function') {
        callback({ success: true, data: savedKeyData });
      }
    } catch (error: any) {
      logger.error({ error: error.message }, 'Exchange key error');
      if (typeof callback === 'function') {
        callback({ success: false, error: error.message });
      }
    }
  }

  /**
   * Return all OTHER participants' keys for a conversation.
   */
  private async handleFetchKeys(
    socket: Socket,
    { conversationId }: { conversationId: string },
    callback?: Function
  ) {
    try {
      const userId = (socket as any).user?.id;
      if (!userId) throw new Error('Unauthenticated socket');

      if (!conversationId || conversationId === 'empty') {
        if (typeof callback === 'function') {
          callback({ success: true, data: { keys: [] } });
        }
        return;
      }

      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { participants: true },
      });

      if (!conversation) {
        if (typeof callback === 'function') {
          callback({ success: false, message: 'Conversation not found' });
        }
        return;
      }

      const isParticipant = conversation.participants.some((p) => p.userId === userId);
      if (!isParticipant) {
        if (typeof callback === 'function') {
          callback({ success: false, message: 'You are not a participant of this conversation' });
        }
        return;
      }

      const allKeys: KeyExchangeParticipants =
        (conversation.keyExchangeData as unknown as KeyExchangeParticipants) || {};

      const keys = Object.entries(allKeys)
        .filter(([uid]) => uid !== userId)
        .map(([uid, keyData]) => ({
          userId: uid,
          publicKey: keyData.publicKey,
          keyId: keyData.keyId,
          keyVersion: keyData.keyVersion,
          exchangedAt: keyData.exchangedAt,
          isActive: keyData.isActive,
        }));

      logger.debug({ userId, conversationId, keysCount: keys.length }, 'Fetched encryption keys');

      if (typeof callback === 'function') {
        callback({
          success: true,
          data: {
            conversationId,
            exchangeStatus: conversation.keyExchangeStatus,
            keys,
          },
        });
      }
    } catch (error: any) {
      logger.error({ error: error.message }, 'Fetch keys error');
      if (typeof callback === 'function') {
        callback({ success: false, error: error.message });
      }
    }
  }

  /**
   * Verify whether the calling user has a key stored for the given conversation.
   */
  private async handleVerifyKey(
    socket: Socket,
    { conversationId }: { conversationId: string },
    callback?: Function
  ) {
    try {
      const userId = (socket as any).user?.id;
      if (!userId) throw new Error('Unauthenticated socket');

      if (!conversationId || conversationId === 'empty') {
        if (typeof callback === 'function') {
          callback({ success: true, verified: false, message: 'No active conversation' });
        }
        return;
      }

      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
      });

      if (!conversation) {
        if (typeof callback === 'function') {
          callback({ success: false, verified: false, message: 'Conversation not found' });
        }
        return;
      }

      const allKeys: KeyExchangeParticipants =
        (conversation.keyExchangeData as unknown as KeyExchangeParticipants) || {};

      const keyData = allKeys[userId];
      const verified = !!keyData?.publicKey;

      logger.debug({ userId, conversationId, verified }, 'Encryption key verification');

      if (typeof callback === 'function') {
        callback({
          success: true,
          verified,
          keyInfo: verified
            ? {
                keyId: keyData.keyId,
                keyVersion: keyData.keyVersion,
                exchangedAt: keyData.exchangedAt,
              }
            : null,
          message: verified ? 'Key verified' : 'No key found for this user in this conversation',
        });
      }
    } catch (error: any) {
      logger.error({ error: error.message }, 'Verify key error');
      if (typeof callback === 'function') {
        callback({ success: false, verified: false, error: error.message });
      }
    }
  }

  /**
   * Broadcast a newly-generated key to all other participants in the room.
   */
  private handleKeyGenerated(
    socket: Socket,
    { conversationId, publicKey, keyId, keyVersion }: {
      conversationId: string;
      publicKey: string;
      keyId: string;
      keyVersion: number;
    }
  ) {
    const userId = (socket as any).user?.id;

    socket.to(conversationId).emit('encryption:key-updated', {
      conversationId,
      userId,
      publicKey,
      keyId,
      keyVersion,
    });
    socket.to(`conv:${conversationId}`).emit('encryption:key-updated', {
      conversationId,
      userId,
      publicKey,
      keyId,
      keyVersion,
    });

    logger.info({ userId, conversationId, keyId, keyVersion }, 'Encryption key generated and broadcasted');
  }
}
