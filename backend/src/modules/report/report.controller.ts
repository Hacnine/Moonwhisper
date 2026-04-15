import { Request, Response } from 'express';
import prisma from '../../config/database.js';

const VALID_REASONS = [
  'spam', 'harassment', 'hate_speech', 'violence',
  'nudity', 'false_info', 'impersonation', 'other',
] as const;

const VALID_STATUSES = ['pending', 'reviewed', 'resolved', 'dismissed'] as const;

const VALID_ACTIONS = [
  'none', 'warning', 'temporary_ban', 'permanent_ban', 'content_removed',
] as const;

export const reportConversation = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const conversationId = req.params.conversationId as string;
    const { reason, details } = req.body;

    if (!reason || !VALID_REASONS.includes(reason)) {
      return res.status(400).json({
        message: `Invalid reason. Must be one of: ${VALID_REASONS.join(', ')}`,
      });
    }

    // Verify user is a participant
    const participant = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });

    if (!participant) {
      return res.status(403).json({ message: 'You are not a participant of this conversation' });
    }

    // Get the other participant (reported user)
    const otherParticipant = await prisma.conversationParticipant.findFirst({
      where: { conversationId, userId: { not: userId } },
    });

    if (!otherParticipant) {
      return res.status(400).json({ message: 'No other participant found in this conversation' });
    }

    // Check for existing recent report (within 24h)
    const recentReport = await prisma.report.findFirst({
      where: {
        reporterId: userId,
        conversationId,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });

    if (recentReport) {
      return res.status(429).json({
        message: 'You have already reported this conversation in the last 24 hours',
      });
    }

    const report = await prisma.report.create({
      data: {
        reporterId: userId,
        reportedUserId: otherParticipant.userId,
        conversationId,
        reason,
        details: details || '',
      },
    });

    res.status(201).json({
      message: 'Report submitted successfully.',
      reportId: report.id
    });
  } catch (error: any) {
    console.error('reportConversation error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getReports = async (req: Request, res: Response) => {
  try {
    const { page = '1', limit = '20', status } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
    if (status && VALID_STATUSES.includes(status as any)) {
      where.status = status;
    }

    const [reports, total] = await Promise.all([
      prisma.report.findMany({
        where,
        include: {
          reporter: { select: { id: true, name: true, email: true, image: true } },
          reportedUser: { select: { id: true, name: true, email: true, image: true } },
          conversation: true,
          reviewedBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.report.count({ where }),
    ]);

    res.json({
      reports,
      totalReports: total,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
    });
  } catch (error: any) {
    console.error('getReports error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateReportStatus = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const reportId = req.params.reportId as string;
    const { status, resolution, actionTaken } = req.body;

    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        message: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
      });
    }

    if (actionTaken && !VALID_ACTIONS.includes(actionTaken)) {
      return res.status(400).json({
        message: `Invalid actionTaken. Must be one of: ${VALID_ACTIONS.join(', ')}`,
      });
    }

    const report = await prisma.report.findUnique({ where: { id: reportId } });
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    const updated = await prisma.report.update({
      where: { id: reportId },
      data: {
        status,
        resolution: resolution ?? report.resolution,
        actionTaken: actionTaken ?? report.actionTaken,
        reviewedById: userId,
        reviewedAt: new Date(),
      },
    });

    res.json({
      message: 'Report updated successfully.',
      report: updated
    });
  } catch (error: any) {
    console.error('updateReportStatus error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getReportStats = async (req: Request, res: Response) => {
  try {
    const [byStatus, byReason] = await Promise.all([
      prisma.report.groupBy({ by: ['status'], _count: { id: true } }),
      prisma.report.groupBy({ by: ['reason'], _count: { id: true } }),
    ]);

    const statusStats: Record<string, number> = {};
    for (const item of byStatus) {
      statusStats[item.status] = item._count.id;
    }

    const reasonStats: Record<string, number> = {};
    let total = 0;
    for (const item of byReason) {
      reasonStats[item.reason] = item._count.id;
      total += item._count.id;
    }

    res.json({ byStatus: statusStats, byReason: reasonStats, total });
  } catch (error: any) {
    console.error('getReportStats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
