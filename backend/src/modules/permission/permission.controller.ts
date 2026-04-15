import { Request, Response } from 'express';
import prisma from '../../config/database.js';

const VALID_PERMISSION_TYPES = [
  'text', 'image', 'voice', 'video', 'file', 'sticker', 'gif',
] as const;

type PermType = (typeof VALID_PERMISSION_TYPES)[number];

const PERM_FIELD_MAP: Record<PermType, string> = {
  text: 'permText',
  image: 'permImage',
  voice: 'permVoice',
  video: 'permVideo',
  file: 'permFile',
  sticker: 'permSticker',
  gif: 'permGif',
};

function getPermissionsFromConversation(conv: any): Record<PermType, boolean> {
  return {
    text: conv.permText,
    image: conv.permImage,
    voice: conv.permVoice,
    video: conv.permVideo,
    file: conv.permFile,
    sticker: conv.permSticker,
    gif: conv.permGif,
  };
}

export const getMessagePermissions = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const conversationId = req.params.conversationId as string;

    // Verify participant
    const participant = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });

    if (!participant) {
      return res.status(403).json({ message: 'You are not a participant of this conversation' });
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    const pendingRequests = await prisma.permissionRequest.findMany({
      where: { conversationId, status: 'pending' },
      include: {
        requester: { select: { id: true, name: true, image: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const isAdmin = !!(await prisma.conversationAdmin.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    }));

    const permissions = getPermissionsFromConversation(conversation);

    res.json({ permissions, pendingRequests, isAdmin });
  } catch (error: any) {
    console.error('getMessagePermissions error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const requestPermission = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const conversationId = req.params.conversationId as string;
    const { permissionType, reason } = req.body;

    if (!permissionType || !VALID_PERMISSION_TYPES.includes(permissionType)) {
      return res.status(400).json({
        message: `Invalid permissionType. Must be one of: ${VALID_PERMISSION_TYPES.join(', ')}`,
      });
    }

    // Verify participant
    const participant = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });

    if (!participant) {
      return res.status(403).json({ message: 'You are not a participant of this conversation' });
    }

    // Check if permission is already enabled
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    const fieldName = PERM_FIELD_MAP[permissionType as PermType];
    if ((conversation as any)[fieldName] === true) {
      return res.status(400).json({ message: `Permission '${permissionType}' is already enabled` });
    }

    // Check for existing pending request
    const existingRequest = await prisma.permissionRequest.findFirst({
      where: {
        conversationId,
        requesterId: userId,
        permissionType,
        status: 'pending',
      },
    });

    if (existingRequest) {
      return res.status(409).json({ message: 'A pending request for this permission already exists' });
    }

    const request = await prisma.permissionRequest.create({
      data: {
        conversationId,
        requesterId: userId,
        permissionType,
        reason: reason || '',
      },
    });

    res.status(201).json({ message: 'Permission request submitted successfully', request });
  } catch (error: any) {
    console.error('requestPermission error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getPermissionRequests = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const conversationId = req.params.conversationId as string;
    const { status } = req.query as Record<string, string>;

    // Verify admin
    const isAdmin = await prisma.conversationAdmin.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });

    if (!isAdmin) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const where: any = { conversationId };
    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      where.status = status;
    }

    const requests = await prisma.permissionRequest.findMany({
      where,
      include: {
        requester: { select: { id: true, name: true, email: true, image: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ requests });
  } catch (error: any) {
    console.error('getPermissionRequests error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const reviewPermissionRequest = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const requestId = req.params.requestId as string;
    const { status: rawStatus, action, reviewNote } = req.body;

    // Accept old-style "action" (approve/reject) or new-style "status" (approved/rejected)
    let status = rawStatus;
    if (!status && action) {
      if (action === 'approve') status = 'approved';
      else if (action === 'reject' || action === 'deny') status = 'rejected';
    }

    if (!status || !['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Status must be either approved or rejected' });
    }

    const request = await prisma.permissionRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      return res.status(404).json({ message: 'Permission request not found' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'This request has already been reviewed' });
    }

    // Verify admin access
    const isAdmin = await prisma.conversationAdmin.findUnique({
      where: { conversationId_userId: { conversationId: request.conversationId, userId } },
    });

    if (!isAdmin) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const updated = await prisma.permissionRequest.update({
      where: { id: requestId },
      data: {
        status,
        reviewedById: userId,
        reviewedAt: new Date(),
        reviewNote: reviewNote || '',
      },
    });

    // If approved, update conversation permission
    if (status === 'approved') {
      const fieldName = PERM_FIELD_MAP[request.permissionType as PermType];
      await prisma.conversation.update({
        where: { id: request.conversationId },
        data: { [fieldName]: true },
      });
    }

    res.json({ message: `Permission request ${status} successfully`, request: updated });
  } catch (error: any) {
    console.error('reviewPermissionRequest error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateMessagePermissions = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const conversationId = req.params.conversationId as string;
    const { permissions } = req.body;

    if (!permissions || typeof permissions !== 'object') {
      return res.status(400).json({ message: 'permissions object is required' });
    }

    // Verify admin access
    const isAdmin = await prisma.conversationAdmin.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });

    if (!isAdmin) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    // Validate and build update data
    const updateData: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(permissions)) {
      if (!VALID_PERMISSION_TYPES.includes(key as any)) {
        return res.status(400).json({
          message: `Invalid permission type: ${key}. Must be one of: ${VALID_PERMISSION_TYPES.join(', ')}`,
        });
      }
      if (typeof value !== 'boolean') {
        return res.status(400).json({ message: `Permission value for '${key}' must be a boolean` });
      }
      updateData[PERM_FIELD_MAP[key as PermType]] = value;
    }

    const updated = await prisma.conversation.update({
      where: { id: conversationId },
      data: updateData,
    });

    res.json({ message: 'Permissions updated successfully', permissions: getPermissionsFromConversation(updated) });
  } catch (error: any) {
    console.error('updateMessagePermissions error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
