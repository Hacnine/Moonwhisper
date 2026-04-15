import { Request, Response } from 'express';
import prisma from '../../config/database.js';

export const createSiteSecurityMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { goodMessage, badMessage } = req.body;

    if (!goodMessage || !badMessage) {
      res.status(400).json({ success: false, message: 'Both goodMessage and badMessage are required' });
      return;
    }

    const record = await prisma.siteSecurityMessage.create({
      data: { goodMessage, badMessage },
    });

    res.status(201).json({
      success: true,
      message: 'Site security message created successfully',
      data: record
    });
  } catch (error: any) {
    console.error('Create site security message error:', error);
    res.status(500).json({ message: 'Failed to create site security message.', error: error.message });
  }
};

export const verifySiteSecurityMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { message } = req.body;

    if (!message) {
      res.status(400).json({ success: false, message: 'Message is required for verification' });
      return;
    }

    const record = await prisma.siteSecurityMessage.findFirst({
      where: {
        OR: [
          { goodMessage: message },
          { badMessage: message },
        ],
      },
    });

    if (record) {
      if (record.goodMessage === message) {
        res.status(200).json({
          success: true,
          message: 'Security Pin verified successfully',
          data: { id: record.id, verifiedAt: new Date() }
        });
        return;
      }
      if (record.badMessage === message) {
        res.status(200).json({
          success: true,
          message: 'Security Pin verified successfully',
          data: { id: record.id, verifiedAt: new Date() }
        });
        return;
      }
    }

    // Default fallback messages (matching old behavior)
    const normalizedMessage = message.toLowerCase().trim();
    if (normalizedMessage === 'assalam') {
      res.status(200).json({
        success: true,
        message: 'Security Pin verified successfully',
        data: { messageType: 'good', verifiedAt: new Date(), isDefault: true }
      });
      return;
    }
    if (normalizedMessage === 'goodmorning') {
      res.status(200).json({
        success: true,
        message: 'Security Pin verified successfully',
        data: { messageType: 'bad', verifiedAt: new Date(), isDefault: true }
      });
      return;
    }

    res.status(401).json({ success: false, message: "Invalid pin. Please enter 'valid pin'." });
  } catch (error: any) {
    console.error('Verify site security message error:', error);
    res.status(500).json({ success: false, message: 'Failed to verify site security message.', error: error.message });
  }
};

export const getSiteSecurityMessages = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.query;

    if (id) {
      const record = await prisma.siteSecurityMessage.findUnique({
        where: { id: id as string },
      });

      if (!record) {
        res.status(404).json({ message: 'Site security message not found.' });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Site security message retrieved successfully',
        data: {
          id: record.id,
          goodMessage: record.goodMessage,
          badMessage: record.badMessage,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        },
      });
      return;
    }

    const records = await prisma.siteSecurityMessage.findMany({
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({
      success: true,
      message: 'Site security messages retrieved successfully',
      data: records.map((record: any) => ({
        id: record.id,
        goodMessage: record.goodMessage,
        badMessage: record.badMessage,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      })),
    });
  } catch (error: any) {
    console.error('Get site security messages error:', error);
    res.status(500).json({ message: 'Failed to get site security messages.', error: error.message });
  }
};
