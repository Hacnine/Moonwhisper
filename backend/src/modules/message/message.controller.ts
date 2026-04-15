import { Request, Response } from 'express';
import prisma from '../../config/database.js';
import fs from 'fs';
import path from 'path';
import { emitMessageToConversationParticipants } from './message.gateway.js';
import {
  encryptMessage as backendEncrypt,
  decryptMessage as backendDecrypt,
  isBackendEncrypted,
  encryptBuffer,
} from '../../services/backendEncryptionService.js';
import {
  decryptTransportText,
  decryptTransportFile,
  isSMTEEncrypted,
} from '../../services/smteService.js';

/**
 * Normalize a Prisma message object to the shape the frontend expects.
 * Maps: conversationId → conversation (alias), sender/receiver to { id, name }.
 */
function formatMessageForFrontend(msg: any): any {
  if (!msg) return msg;
  const formatted: any = { ...msg };
  // Add _id alias so frontend code using message._id still works
  formatted._id = msg.id;
  // Add 'conversation' alias so frontend can use message.conversation
  formatted.conversation = msg.conversationId;
  // Normalize sender: frontend expects { id, name, username } not just { name }
  if (msg.sender && typeof msg.sender === 'object') {
    formatted.sender = { id: msg.senderId, ...msg.sender, username: msg.sender.name };
  } else {
    formatted.sender = msg.senderId;
  }
  // Normalize receiver: same pattern
  if (msg.receiver && typeof msg.receiver === 'object') {
    formatted.receiver = { id: msg.receiverId, ...msg.receiver, username: msg.receiver.name };
  } else {
    formatted.receiver = msg.receiverId || null;
  }
  // Normalize replyTo: ensure _id alias is present
  if (msg.replyTo && typeof msg.replyTo === 'object') {
    formatted.replyTo = { ...msg.replyTo, _id: msg.replyTo.id };
  }
  // Flatten deletedBy from join-table entries to array of userIds
  if (Array.isArray(msg.deletedBy)) {
    formatted.deletedBy = msg.deletedBy.map((d: any) => d.userId ?? d);
  }
  // Flatten readBy from join-table entries
  if (Array.isArray(msg.readBy)) {
    formatted.readBy = msg.readBy.map((r: any) => (r.userId ? { user: r.userId, readAt: r.readAt } : r));
  }
  return formatted;
}

const mapMimeTypeToMediaType = (mimeType: string) => {
  if (!mimeType) return 'file';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'file';
};

async function handleBackendEncryption(text: string, conversationId?: string) {
  if (!text || typeof text !== 'string') return { text, isBackendEncrypted: false };

  if (isSMTEEncrypted(text) && conversationId) {
    try {
      const plaintext = await decryptTransportText(text, conversationId);
      const encrypted = await backendEncrypt(plaintext);
      return { text: encrypted, isBackendEncrypted: true };
    } catch {
      return { text, isBackendEncrypted: false };
    }
  }

  if (text.startsWith('__BACKEND_ENCRYPT__:')) {
    const actual = text.substring('__BACKEND_ENCRYPT__:'.length);
    const encrypted = await backendEncrypt(actual);
    return { text: encrypted, isBackendEncrypted: true };
  }

  if (isBackendEncrypted(text)) return { text, isBackendEncrypted: true };
  return { text, isBackendEncrypted: false };
}

async function handleBackendDecryption(text: string) {
  if (!text || typeof text !== 'string') return text;
  if (isBackendEncrypted(text)) {
    try { return await backendDecrypt(text); } catch { return text; }
  }
  return text;
}

export const sendFileMessage = async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  const body = req.body || {};
  const resolvedReceiver = body.receiver;
  const resolvedText = body.text || null;
  const clientTempId = body.clientTempId;
  let resolvedConversationId = req.params.conversationId || body.conversationId;

  try {
    if (!userId) return res.status(400).json({ message: 'Invalid sender ID' });
    if (!(req as any).io) return res.status(500).json({ message: 'Socket.IO not initialized' });

    // Find or create conversation
    let conversation;
    if (resolvedConversationId) {
      conversation = await prisma.conversation.findUnique({
        where: { id: resolvedConversationId },
        include: { participants: true },
      });
    }
    // If no conversationId provided, look for an existing 1-on-1 conversation
    if (!conversation && resolvedReceiver) {
      const existing = await prisma.conversation.findFirst({
        where: {
          isGroup: false,
          participants: { every: { userId: { in: [userId, resolvedReceiver] } } },
        },
        include: { participants: true },
      });
      // Verify it has exactly 2 participants (both sender and receiver)
      if (existing && existing.participants.length === 2) {
        conversation = existing;
      } else {
        conversation = await prisma.conversation.create({
          data: { participants: { create: [{ userId }, { userId: resolvedReceiver }] } },
          include: { participants: true },
        });
      }
    }
    if (!conversation) return res.status(400).json({ message: 'Conversation not found' });
    resolvedConversationId = conversation.id;

    const files = (req as any).files as Express.Multer.File[] | undefined;
    let mediaFiles: any[] = [];
    if (files?.length) {
      // Check for SMTE-encrypted files: frontend sends encrypted file data
      // in a form field 'smteEncryptedFiles' as JSON array
      const smteEncryptedFilesRaw = req.body.smteEncryptedFiles;
      let smteEncryptedMap: Map<string, any> | null = null;
      if (smteEncryptedFilesRaw) {
        try {
          const parsed = JSON.parse(smteEncryptedFilesRaw);
          smteEncryptedMap = new Map();
          for (const entry of parsed) {
            smteEncryptedMap.set(entry.filename, entry);
          }
        } catch {}
      }

      const isBackendMode = req.body.encryptionMethod === 'Backend'
        || (resolvedText && (resolvedText.startsWith('__BACKEND_ENCRYPT__:') || isSMTEEncrypted(resolvedText)))
        || !!smteEncryptedFilesRaw;

      for (const file of files) {
        const finalPath = `uploads/${file.filename}`;
        const diskPath = path.join(process.cwd(), finalPath);

        if (smteEncryptedMap && smteEncryptedMap.has(file.originalname)) {
          // SMTE-encrypted: decrypt transport layer → re-encrypt at rest
          try {
            const envelope = smteEncryptedMap.get(file.originalname);
            const decryptedBuf = await decryptTransportFile(envelope, resolvedConversationId);
            const encryptedAtRest = await encryptBuffer(decryptedBuf);
            fs.writeFileSync(diskPath, encryptedAtRest);
          } catch {}
        } else if (isBackendMode) {
          try {
            const plainBuf = fs.readFileSync(diskPath);
            const encrypted = await encryptBuffer(plainBuf);
            fs.writeFileSync(diskPath, encrypted);
          } catch {}
        }

        mediaFiles.push({ url: finalPath, type: mapMimeTypeToMediaType(file.mimetype), filename: file.originalname, size: file.size });
      }
    }

    // Determine messageType from unique media types (matches old code logic)
    let messageType = 'text';
    if (mediaFiles.length > 0) {
      const uniqueTypes = [...new Set(mediaFiles.map((f: any) => f.type))];
      messageType = uniqueTypes.length === 1 ? uniqueTypes[0] : 'mixed';
    }

    let processedText = resolvedText;
    let isBackendEncryptedFlag = false;
    if (resolvedText) {
      const result = await handleBackendEncryption(resolvedText, resolvedConversationId);
      processedText = result.text;
      isBackendEncryptedFlag = result.isBackendEncrypted;
    }

    const otherParticipant = conversation.participants.find((p: any) => p.userId !== userId);
    const finalReceiver = resolvedReceiver || otherParticipant?.userId;

    const newMessage = await prisma.message.create({
      data: {
        senderId: userId,
        receiverId: finalReceiver,
        conversationId: resolvedConversationId,
        text: processedText,
        messageType: messageType as any,
        status: 'sent',
        isBackendEncrypted: isBackendEncryptedFlag,
        media: { create: mediaFiles },
      },
      include: { sender: { select: { name: true } }, receiver: { select: { name: true } }, media: true },
    });

    // Update conversation
    await prisma.conversation.update({
      where: { id: resolvedConversationId },
      data: { lastMessageText: processedText || '[Media]', lastMessageSenderId: userId, lastMessageTimestamp: new Date() },
    });

    let responseMsg: any = { ...newMessage, clientTempId };
    if (responseMsg.isBackendEncrypted && responseMsg.text) {
      responseMsg.text = await handleBackendDecryption(responseMsg.text);
    }
    responseMsg = formatMessageForFrontend(responseMsg);

    await emitMessageToConversationParticipants((req as any).io, resolvedConversationId, 'receiveMessage', responseMsg);
    res.status(201).json({ message: responseMsg, conversationId: resolvedConversationId });
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Server error' });
  }
};

export const sendTextMessage = async ({ io, socket, conversationId, sender, receiver, text, clientTempId, replyToId }: any) => {
  try {
    if (!text) { socket.emit('sendMessageError', { message: 'Message cannot be empty', clientTempId }); return; }
    if (!sender) { socket.emit('sendMessageError', { message: 'Invalid sender ID', clientTempId }); return; }

    let conversation;
    if (conversationId) {
      conversation = await prisma.conversation.findUnique({ where: { id: conversationId }, include: { participants: true } });
    }
    // If no conversationId provided, look for an existing 1-on-1 conversation
    if (!conversation && receiver) {
      const existing = await prisma.conversation.findFirst({
        where: {
          isGroup: false,
          participants: { every: { userId: { in: [sender, receiver] } } },
        },
        include: { participants: true },
      });
      // Verify it has exactly 2 participants (both sender and receiver)
      if (existing && existing.participants.length === 2) {
        conversation = existing;
      } else {
        conversation = await prisma.conversation.create({
          data: { participants: { create: [{ userId: sender }, { userId: receiver }] } },
          include: { participants: true },
        });
      }
    }
    if (!conversation) { socket.emit('sendMessageError', { message: 'Conversation not found', clientTempId }); return; }

    const resolvedConversationId = conversation.id;
    const encResult = await handleBackendEncryption(text, resolvedConversationId);
    const otherParticipant = conversation.participants.find((p: any) => p.userId !== sender);

    const msg = await prisma.message.create({
      data: {
        senderId: sender,
        receiverId: receiver || otherParticipant?.userId,
        conversationId: resolvedConversationId,
        text: encResult.text,
        messageType: 'text',
        status: 'sent',
        isBackendEncrypted: encResult.isBackendEncrypted,
        ...(replyToId ? { replyToId } : {}),
      },
      include: {
        sender: { select: { name: true } },
        receiver: { select: { name: true } },
        ...(replyToId ? { replyTo: { select: { id: true, text: true, messageType: true, media: true, isBackendEncrypted: true } } } : {}),
      },
    });

    await prisma.conversation.update({
      where: { id: resolvedConversationId },
      data: { lastMessageText: text, lastMessageSenderId: sender, lastMessageTimestamp: new Date() },
    });

    let responseMsg: any = { ...msg, clientTempId };
    if (responseMsg.isBackendEncrypted && responseMsg.text) {
      responseMsg.text = await handleBackendDecryption(responseMsg.text);
    }
    responseMsg = formatMessageForFrontend(responseMsg);

    await emitMessageToConversationParticipants(io, resolvedConversationId, 'receiveMessage', responseMsg);
    socket.emit('sendMessageSuccess', { message: responseMsg, conversationId: resolvedConversationId });
  } catch (error: any) {
    socket.emit('sendMessageError', { message: error.message || 'Server error', clientTempId });
  }
};

export const markMessagesAsDelivered = async (conversationId: string, userId: string, io: any) => {
  try {
    const result = await prisma.message.updateMany({
      where: { conversationId, receiverId: userId, status: 'sent' },
      data: { status: 'delivered' },
    });
    if (result.count > 0 && io) {
      const delivered = await prisma.message.findMany({
        where: { conversationId, receiverId: userId, status: 'delivered' },
        select: { id: true },
      });
      io.to(conversationId).emit('messagesDelivered', { conversationId, userId, messageIds: delivered.map((m: any) => m.id) });
    }
  } catch (error) {
    console.error('Error marking messages as delivered:', error);
  }
};

export const markMessagesAsRead = async (conversationId: string, userId: string, io: any) => {
  try {
    // Mark as read
    const messages = await prisma.message.findMany({
      where: { conversationId, receiverId: userId, status: { not: 'read' } },
      select: { id: true },
    });
    if (messages.length > 0) {
      await prisma.message.updateMany({
        where: { id: { in: messages.map((m: any) => m.id) } },
        data: { status: 'read' },
      });
      // Create readBy entries
      const readByData = messages.map((m: any) => ({ messageId: m.id, userId, readAt: new Date() }));
      await prisma.messageReadBy.createMany({ data: readByData, skipDuplicates: true });

      io?.to(conversationId).emit('messagesRead', { conversationId, userId, messageIds: messages.map((m: any) => m.id) });
    }

    // Reset unread count for conversation
    await prisma.conversationUnread.updateMany({
      where: { conversationId, userId },
      data: { count: 0 },
    });
  } catch (error) {
    console.error('Error marking messages as read:', error);
  }
};

export const editMessageCore = async ({ messageId, sender, text, htmlEmoji, emojiType, clientTempId }: any) => {
  try {
    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message) return { success: false, message: 'Message not found', clientTempId };
    if (message.senderId !== sender) return { success: false, message: 'Unauthorized', clientTempId };
    if (message.messageType !== 'text') return { success: false, message: 'Only text messages can be edited', clientTempId };

    // Save edit history
    if (message.text) {
      await prisma.messageEditHistory.create({
        data: { messageId, text: message.text, editedAt: new Date() },
      });
    }

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { text: text ?? message.text, htmlEmoji: htmlEmoji ?? null, emojiType: emojiType ?? null, edited: true },
      include: { sender: { select: { name: true } }, receiver: { select: { name: true } } },
    });

    return { success: true, message: formatMessageForFrontend({ ...updated, clientTempId }), conversationId: message.conversationId, clientTempId };
  } catch (error: any) {
    return { success: false, message: error.message, clientTempId };
  }
};

export const editMessage = async (req: Request, res: Response) => {
  const { messageId } = req.params;
  const body = req.body || {};
  const { text, htmlEmoji, emojiType, clientTempId } = body;
  const sender = (req as any).user.id;

  const result = await editMessageCore({ messageId, sender, text, htmlEmoji, emojiType, clientTempId });
  if (!result.success) return res.status(400).json({ message: result.message, clientTempId });

  (req as any).io?.to(result.conversationId).emit('messageEdited', result.message);
  res.status(200).json({ message: result.message, clientTempId });
};

export const deleteMessage = async ({ io, socket, messageId, userId, req, res }: any) => {
  try {
    const message = await prisma.message.findUnique({ where: { id: messageId }, include: { media: true } });
    if (!message) {
      if (res) return res.status(404).json({ message: 'Message not found' });
      socket?.emit('deleteMessageError', { message: 'Message not found' });
      return;
    }

    // Authorization check: verify user is a participant in the conversation (matches old code)
    const participant = await prisma.conversationParticipant.findFirst({
      where: { conversationId: message.conversationId, userId },
    });
    if (!participant) {
      if (res) return res.status(403).json({ message: 'Unauthorized to delete this message' });
      socket?.emit('deleteMessageError', { message: 'Unauthorized to delete this message' });
      return;
    }

    let hardDelete = false;

    if (message.senderId === userId) {
      // Hard delete - also delete media files
      hardDelete = true;
      if (message.media?.length) {
        for (const mediaItem of message.media) {
          try {
            const filePath = path.join(process.cwd(), mediaItem.url || '');
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          } catch {}
        }
      }
      await prisma.messageMedia.deleteMany({ where: { messageId } });
      await prisma.message.delete({ where: { id: messageId } });
    } else {
      // Soft delete for receiver
      await prisma.messageDeletedBy.create({ data: { messageId, userId } });
    }

    io?.to(message.conversationId).emit('messageDeleted', { messageId, userId, hardDelete, conversationId: message.conversationId });
    if (res) return res.status(200).json({ message: 'Message deleted successfully', hardDelete });
  } catch (error) {
    if (res) return res.status(500).json({ message: 'Server error' });
    socket?.emit('deleteMessageError', { message: 'Server error' });
  }
};

export const getMessages = async (req: Request, res: Response) => {
  const { conversationId } = req.params as { conversationId: string };
  const { userId, page = '1', limit = '20' } = req.query as Record<string, string>;
  try {
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    if (!userId) return res.status(403).json({ message: 'Unauthorized' });

    const messages = await prisma.message.findMany({
      where: { conversationId, deletedBy: { none: { userId } } },
      include: { sender: { select: { name: true } }, receiver: { select: { name: true } }, media: true, replyTo: { select: { id: true, text: true, messageType: true, media: true, isBackendEncrypted: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    });

    // Decrypt messages and replyTo text (matches old code)
    for (const msg of messages) {
      if (msg.isBackendEncrypted && msg.text) {
        msg.text = await handleBackendDecryption(msg.text);
      }
      if ((msg as any).replyTo?.isBackendEncrypted && (msg as any).replyTo?.text) {
        (msg as any).replyTo.text = await handleBackendDecryption((msg as any).replyTo.text);
      }
    }

    const formatted = messages.map(formatMessageForFrontend);
    const total = await prisma.message.count({ where: { conversationId, deletedBy: { none: { userId } } } });
    res.status(200).json({ messages: formatted, totalPages: Math.ceil(total / limitNum), currentPage: pageNum });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const getConversationImages = async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params as { conversationId: string };
    const { cursor, limit = '20', direction = 'older' } = req.query as Record<string, string>;
    const parsedLimit = Math.min(Number(limit) || 20, 50);

    const where: any = {
      conversationId,
      messageType: 'image',
      // Exclude emoji images (matches old code filter)
      OR: [{ emojiType: null }, { emojiType: { equals: undefined as any } }],
    };
    // Prisma doesn't support $exists, so filter with emojiType: null
    delete where.OR;
    where.emojiType = null;

    const sortOrder = direction === 'older' ? 'desc' : 'asc';

    if (cursor) {
      const cursorDate = new Date(Number(cursor));
      where.createdAt = direction === 'older' ? { lt: cursorDate } : { gt: cursorDate };
    }

    const messages = await prisma.message.findMany({
      where,
      include: { media: { where: { type: 'image' } } },
      orderBy: { createdAt: sortOrder as any },
      take: parsedLimit,
    });

    // Normalize order: old code reverses for 'older' direction
    const normalizedMessages = direction === 'older' ? messages.reverse() : messages;

    res.status(200).json({
      images: normalizedMessages.map((msg: any) => ({
        _id: msg.id,
        id: msg.id,
        createdAt: msg.createdAt,
        media: msg.media.filter((m: any) => m.type === 'image'),
        sender: msg.senderId,
      })),
      nextCursor: normalizedMessages.length > 0
        ? new Date(normalizedMessages[normalizedMessages.length - 1].createdAt).getTime()
        : null,
      hasMore: normalizedMessages.length === parsedLimit,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load images' });
  }
};

export const addReaction = async ({ conversationId, messageId, userId, emoji }: any) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    if (!user) return { success: false, message: 'User not found' };

    await prisma.messageReaction.upsert({
      where: { messageId_userId_emoji: { messageId, userId, emoji } },
      create: { messageId, userId, emoji, username: user.name },
      update: { emoji, username: user.name },
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
};

export const removeReaction = async ({ conversationId, messageId, userId }: any) => {
  try {
    await prisma.messageReaction.deleteMany({ where: { messageId, userId } });
    return { success: true };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
};

// Shared logic for sending emojis (matches old code's sendEmojiCore)
export const sendEmojiCore = async ({ sender, receiver, conversationId, text, htmlEmoji, emojiType, mediaUrl, clientTempId }: any) => {
  try {
    // Validate emoji data
    if (!sender) return { success: false, message: 'Invalid sender ID', clientTempId };
    if (emojiType === 'custom' && (!text || !htmlEmoji || !mediaUrl)) {
      return { success: false, message: 'Text, htmlEmoji, and mediaUrl are required for custom emojis', clientTempId };
    }
    if (emojiType && !['custom', 'standard'].includes(emojiType)) {
      return { success: false, message: 'Invalid emojiType', clientTempId };
    }

    let conversation;
    if (conversationId) {
      conversation = await prisma.conversation.findUnique({ where: { id: conversationId }, include: { participants: true } });
    }
    if (!conversation && receiver) {
      conversation = await prisma.conversation.create({
        data: { participants: { create: [{ userId: sender }, { userId: receiver }] } },
        include: { participants: true },
      });
    }
    if (!conversation) return { success: false, message: 'Conversation not found', clientTempId };

    const resolvedConversationId = conversation.id;
    const otherParticipant = conversation.participants.find((p: any) => p.userId !== sender);
    const resolvedReceiver = receiver || otherParticipant?.userId;

    const msg = await prisma.message.create({
      data: {
        senderId: sender,
        receiverId: resolvedReceiver,
        conversationId: resolvedConversationId,
        text: text || htmlEmoji || '',
        messageType: 'text',
        htmlEmoji: htmlEmoji || null,
        emojiType: emojiType || null,
        status: 'sent',
        media: emojiType === 'custom' ? { create: [{ url: mediaUrl, type: 'image', filename: text || 'emoji' }] } : undefined,
      },
      include: { sender: { select: { name: true } }, receiver: { select: { name: true } }, media: true },
    });

    await prisma.conversation.update({
      where: { id: resolvedConversationId },
      data: { lastMessageText: text || htmlEmoji || '[Emoji]', lastMessageSenderId: sender, lastMessageTimestamp: new Date() },
    });

    const formattedMsg = formatMessageForFrontend({ ...msg, clientTempId });
    return { success: true, message: formattedMsg, conversationId: resolvedConversationId, clientTempId };
  } catch (error: any) {
    return { success: false, message: error.message || 'Server error', clientTempId };
  }
};

export const handleSendEmojiApi = async (req: Request, res: Response) => {
  const sender = (req as any).user.id;
  const body = req.body || {};
  const { receiver, text, htmlEmoji, emojiType, mediaUrl } = body;
  const conversationId = req.params.conversationId || body.conversationId;

  const result = await sendEmojiCore({ sender, receiver, conversationId, text, htmlEmoji, emojiType, mediaUrl });

  if (!result.success) return res.status(400).json(result);

  // Emit socket events
  if ((req as any).io && result.conversationId) {
    await emitMessageToConversationParticipants((req as any).io, result.conversationId, 'receiveMessage', result.message);
  }

  res.status(201).json(result);
};

export const replyMessage = async (req: Request, res: Response) => {
  const { conversationId, messageId } = req.params as { conversationId: string; messageId: string };
  const body = req.body || {};
  const { text, htmlEmoji, emojiType, clientTempId } = body;
  const sender = (req as any).user.id;

  try {
    const conversation = await prisma.conversation.findUnique({ where: { id: conversationId }, include: { participants: true } });
    if (!conversation) return res.status(404).json({ message: 'Conversation not found' });

    const otherParticipant = conversation.participants.find((p) => p.userId !== sender);

    // Handle media files if present (matches old code)
    const files = (req as any).files as Express.Multer.File[] | undefined;
    let mediaFiles: any[] = [];
    if (files?.length) {
      mediaFiles = files.map((file: Express.Multer.File) => ({
        url: `uploads/${file.filename}`,
        type: mapMimeTypeToMediaType(file.mimetype),
        filename: file.originalname,
        size: file.size,
      }));
    }

    // Determine messageType dynamically (matches old code)
    let finalMessageType = 'text';
    if (mediaFiles.length > 0) {
      const uniqueTypes = [...new Set(mediaFiles.map((f: any) => f.type))];
      finalMessageType = uniqueTypes.length === 1 ? uniqueTypes[0] : 'mixed';
    }

    const msg = await prisma.message.create({
      data: {
        senderId: sender,
        receiverId: otherParticipant?.userId,
        conversationId,
        text: text || htmlEmoji || null,
        messageType: finalMessageType as any,
        htmlEmoji: htmlEmoji || null,
        emojiType: emojiType || null,
        replyToId: messageId,
        status: 'sent',
        ...(mediaFiles.length > 0 ? { media: { create: mediaFiles } } : {}),
      },
      include: { sender: { select: { name: true } }, receiver: { select: { name: true } }, media: true, replyTo: { select: { id: true, text: true, messageType: true, media: true, isBackendEncrypted: true } } },
    });

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageText: text || htmlEmoji || '[Reply]', lastMessageSenderId: sender, lastMessageTimestamp: new Date() },
    });

    // Decrypt replyTo text if backend encrypted (matches old code)
    let responseData: any = { ...msg, clientTempId };
    if (responseData.replyTo?.isBackendEncrypted && responseData.replyTo?.text) {
      responseData.replyTo = { ...responseData.replyTo };
      responseData.replyTo.text = await handleBackendDecryption(responseData.replyTo.text);
    }

    const responseMsg = formatMessageForFrontend(responseData);
    await emitMessageToConversationParticipants((req as any).io, conversationId as string, 'receiveMessage', responseMsg);
    res.status(201).json({ message: responseMsg, conversationId, clientTempId });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
