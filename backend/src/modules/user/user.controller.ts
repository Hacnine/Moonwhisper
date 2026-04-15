import { Request, Response } from 'express';
import prisma from '../../config/database.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { storeToken, getToken, removeToken } from '../../common/utils/redis-token-store.js';
import { getRedisClient } from '../../config/redisClient.js';
import { onlineUsers } from './user.gateway';

type OnlineUserEntry = { socketIds: Set<string>; userData: any };

export const register = async (req: Request, res: Response) => {
  try {
    const settings = await prisma.adminSettings.findFirst();
    const isRegistrationGloballyEnabled = !settings || settings.featureUserRegistration !== false;

    if (!isRegistrationGloballyEnabled) {
      return res.status(400).json({ error: { message: 'Registration is temporarily off.' } });
    }

    const { name, email, password, gender } = req.body;
    if (!name || !email || !password || !gender) {
      return res.status(400).json({ error: { message: 'All fields are required.' } });
    }

    const validGenders = ['male', 'female', 'other'];
    if (!validGenders.includes(gender.toLowerCase())) {
      return res.status(400).json({ error: { message: 'Invalid gender value.' } });
    }

    const normalizedName = name.trim().toLowerCase();
    const existingName = await prisma.user.findFirst({
      where: { name: { equals: normalizedName } },
    });
    if (existingName) {
      return res.status(400).json({ error: { message: `'${name}' name is already taken.` } });
    }

    const normalizedEmail = email.toLowerCase();
    const existingUser = await prisma.user.findFirst({ where: { email: normalizedEmail } });
    if (existingUser) {
      return res.status(400).json({ error: { message: `'${email}' is already taken.` } });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const defaultImage = gender.toLowerCase() === 'male'
      ? '/images/avatar/default-avatar.svg'
      : '/images/avatar/womanav1.svg';

    // If no settings exist, first user becomes admin
    const role = !settings ? 'admin' : 'user';

    const user = await prisma.user.create({
      data: {
        name: normalizedName,
        email: normalizedEmail,
        password: passwordHash,
        gender: gender.toLowerCase(),
        image: defaultImage,
        role: role as any,
      },
    });

    // Create AdminSettings for the first user
    if (!settings) {
      await prisma.adminSettings.create({
        data: { updatedById: user.id },
      });
    }

    // Handle approval
    if (settings?.secRequireAdminApproval) {
      await prisma.userApproval.create({
        data: {
          userId: user.id,
          userAgent: req.headers['user-agent'] || undefined,
        },
      });
      return res.status(201).json({ message: 'User registered. Awaiting approval.' });
    }

    await prisma.user.update({ where: { id: user.id }, data: { isActive: true } });
    return res.status(201).json({ message: 'User registered successfully.' });
  } catch (error: any) {
    return res.status(500).json({ error: { message: 'Internal server error', details: error.message } });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const normalizedEmail = email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user) {
      return res.status(401).json({ message: 'Email or password is incorrect.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Email or password is incorrect.' });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: 'Account is deactivated.' });
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastSeen: new Date() } });

    const isProduction = process.env.NODE_ENV === 'production';
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: (isProduction ? 'none' : 'lax') as 'none' | 'lax',
      path: '/',
    };
    res.clearCookie('access_token', cookieOptions);
    res.clearCookie('refresh_token', cookieOptions);

    const redis = getRedisClient();
    await redis.del(`access_token_${user.id}`);
    await redis.del(`refresh_token_${user.id}`);

    const accessToken = jwt.sign({ id: user.id }, process.env.ACCESS_TOKEN_SECRET!, { expiresIn: '1d' });
    const refreshToken = jwt.sign({ id: user.id }, process.env.REFRESH_TOKEN_SECRET!, { expiresIn: '7d' });

    await storeToken(res, { access: accessToken, refresh: refreshToken }, user.id, req);

    if ((req as any).io) {
      (req as any).io.emit('loggedUsersUpdate', Array.from(onlineUsers.values()).map((u) => u.userData));
    }

    const { password: _, ...safeUser } = user;
    res.status(200).json({ message: 'Login successful', user: safeUser, access: accessToken, refresh: refreshToken });
  } catch (error: any) {
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

export const logout = async (req: Request, res: Response) => {
  try {
    res.clearCookie('access_token', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'none' as const });
    res.clearCookie('refresh_token', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'none' as const });
    await removeToken(res, req);
    res.status(200).json({ message: 'Logged out successfully' });
  } catch (error: any) {
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const searchUser = async (req: Request, res: Response) => {
  try {
    const { query, page = '1', limit = '10' } = req.query as { query?: string; page?: string; limit?: string };
    if (!query) return res.status(400).json({ error: 'Query parameter is required' });

    if (!/^[a-zA-Z0-9._%+\-@ ]*$/.test(query)) {
      return res.status(400).json({ error: 'Invalid query characters' });
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    if (pageNum < 1 || limitNum < 1) {
      return res.status(400).json({ error: 'Page and limit must be positive integers' });
    }

    const isEmail = query.includes('@');
    const where = isEmail
      ? { email: { contains: query } }
      : { name: { contains: query } };

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: { id: true, name: true, image: true },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
    ]);

    if (!users.length) return res.status(200).json({ users: [], total: 0, page: pageNum, totalPages: 0 });

    res.status(200).json({ users, total, page: pageNum, totalPages: Math.ceil(total / limitNum) });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    await prisma.user.delete({ where: { id } });

    const allUsers = await prisma.user.findMany({ omit: { password: true } });
    (req as any).io?.emit('getAllUsersUpdate', allUsers);

    res.status(200).json({ message: 'User deleted successfully.' });
  } catch (error: any) {
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      where: { id: { not: (req as any).user.id } },
      omit: { password: true },
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching users' });
  }
};

export const getUserInfo = async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId as string;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, bio: true, image: true, role: true, isActive: true, lastSeen: true },
    });
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.status(200).json({
      name: user.name,
      email: user.email,
      bio: user.bio || '',
      image: user.image || '',
      role: user.role,
      is_active: user.isActive,
      last_seen: user.lastSeen
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateUserInfo = async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId as string;
    const updateData = req.body;

    const allowedFields = ['name', 'email', 'bio', 'image', 'gender', 'themeIndex', 'fileSendingAllowed',
      'notifNewMessage', 'notifMention', 'notifSound'];
    const filteredData: Record<string, any> = {};

    for (const key of allowedFields) {
      if (updateData[key] !== undefined) filteredData[key] = updateData[key];
    }

    if (req.file) {
      filteredData.image = `/uploads/images/${req.file.filename}`;
    } else if (typeof filteredData.image === 'string') {
      filteredData.image = decodeURIComponent(filteredData.image);
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: filteredData,
      omit: { password: true },
    });

    res.json(updatedUser);
  } catch (error: any) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const getUserThemeIndex = async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: (req as any).user.id },
      select: { themeIndex: true },
    });
    res.json({ themeIndex: user?.themeIndex ?? 0 });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateUserThemeIndex = async (req: Request, res: Response) => {
  try {
    const { themeIndex } = req.body;
    const user = await prisma.user.update({
      where: { id: (req as any).user.id },
      data: { themeIndex },
    });
    res.json({ message: 'Theme index updated', themeIndex: user.themeIndex });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const refreshToken = async (req: Request, res: Response) => {
  try {
    const { refresh_token } = req.cookies || {};
    if (!refresh_token) return res.status(401).json({ message: 'No refresh token' });

    const decoded = jwt.verify(refresh_token, process.env.REFRESH_TOKEN_SECRET!) as { id: string };
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const accessToken = jwt.sign({ id: user.id }, process.env.ACCESS_TOKEN_SECRET!, { expiresIn: '1d' });
    const newRefreshToken = jwt.sign({ id: user.id }, process.env.REFRESH_TOKEN_SECRET!, { expiresIn: '7d' });

    await storeToken(res, { access: accessToken, refresh: newRefreshToken }, user.id, req);

    res.status(200).json({ accessToken });
  } catch (error) {
    res.status(401).json({ message: 'Invalid refresh token' });
  }
};

export const updateName = async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'Name is required' });

    const existing = await prisma.user.findFirst({ where: { name: name.trim().toLowerCase() } });
    if (existing && existing.id !== (req as any).user.id) {
      return res.status(400).json({ message: 'Name already taken' });
    }

    const updated = await prisma.user.update({
      where: { id: (req as any).user.id },
      data: { name: name.trim().toLowerCase() },
      select: { name: true, email: true },
    });
    res.status(200).json({ message: 'Name updated successfully', user: { name: updated.name, email: updated.email } });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateEmail = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email?.trim()) return res.status(400).json({ message: 'Email is required' });

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing && existing.id !== (req as any).user.id) {
      return res.status(400).json({ message: 'Email already in use' });
    }

    const updated = await prisma.user.update({
      where: { id: (req as any).user.id },
      data: { email: email.toLowerCase() },
      select: { name: true, email: true },
    });
    res.status(200).json({ message: 'Email updated successfully', user: { name: updated.name, email: updated.email } });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const updatePassword = async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Both passwords are required' });
    }

    const user = await prisma.user.findUnique({ where: { id: (req as any).user.id } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Current password is incorrect' });

    const hash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: user.id }, data: { password: hash } });
    res.status(200).json({ message: 'Password updated successfully', user: { name: user.name, email: user.email } });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

export const blockUser = async (req: Request, res: Response) => {
  try {
    // Frontend sends 'blockedId'; map to blockedUserId for ConversationBlockEntry
    const { blockedId, conversationId } = req.body;
    const blockerId = (req as any).user.id;

    if (blockerId === blockedId) {
      return res.status(400).json({ message: 'You cannot block yourself.' });
    }

    // Check if already globally blocked
    const existingBlock = await prisma.block.findUnique({
      where: { blockerId_blockedId: { blockerId, blockedId } },
    });
    if (existingBlock) {
      return res.status(400).json({ message: 'User already globally blocked.' });
    }

    const globalBlock = await prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      create: { blockerId, blockedId },
      update: {},
    });

    let updatedConversation: Record<string, any> | null = null;
    if (conversationId) {
      await prisma.conversationBlockEntry.upsert({
        where: {
          conversationId_blockedById_blockedUserId: {
            conversationId,
            blockedById: blockerId,
            blockedUserId: blockedId,
          },
        },
        create: { conversationId, blockedById: blockerId, blockedUserId: blockedId },
        update: {},
      });
      const conv = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { blockList: true },
      });
      if (conv) {
        updatedConversation = {
          ...conv,
          blockList: conv.blockList.map((b) => ({
            ...b,
            blockedBy: b.blockedById,
            blockedUser: b.blockedUserId,
          })),
        };
      }
    }

    res.status(201).json({ message: 'User blocked successfully.', globalBlock, conversation: updatedConversation });
  } catch (error: any) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const unblockUser = async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId as string;
    const blockerId = (req as any).user.id;

    const deletedGlobal = await prisma.block.deleteMany({ where: { blockerId, blockedId: userId } });
    await prisma.conversationBlockEntry.deleteMany({
      where: { blockedById: blockerId, blockedUserId: userId },
    });

    const conv = await prisma.conversation.findFirst({
      where: {
        AND: [
          { participants: { some: { userId: blockerId } } },
          { participants: { some: { userId } } },
        ],
        isGroup: false,
      },
      include: { blockList: true },
    });

    const conversation = conv ? {
      ...conv,
      blockList: conv.blockList.map((b) => ({
        ...b,
        blockedBy: b.blockedById,
        blockedUser: b.blockedUserId,
      })),
    } : null;

    res.json({ message: 'User unblocked successfully.', deletedGlobal, conversation });
  } catch (error: any) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
