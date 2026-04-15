import { Router } from 'express';

// Import from modular structure
import { authRoutes } from './modules/auth/index.js';
import { userRoutes } from './modules/user/index.js';
import { conversationRoutes } from './modules/conversation/index.js';
import { messageRoutes } from './modules/message/index.js';
import { quickMessageRoutes } from './modules/quickMessage/index.js';
import { quickLessonRoutes } from './modules/quickLesson/index.js';
import { adminRoutes } from './modules/admin/index.js';
import { adminUserRoutes } from './modules/adminUser/index.js';
import { notificationRoutes } from './modules/notification/index.js';
import { fileRoutes } from './modules/file/index.js';
import { noticeRoutes } from './modules/notice/index.js';
import { siteSecurityRoutes } from './modules/siteSecurity/index.js';
import { conversationKeyRoutes } from './modules/conversationKey/index.js';
import { reportRoutes } from './modules/report/index.js';
import { permissionRoutes } from './modules/permission/index.js';
import { socialRoutes } from './modules/social/index.js';

const apiRoute = Router();

// Mount module routes
apiRoute.use('/auth', authRoutes);
apiRoute.use('/user', userRoutes);
apiRoute.use('/conversations', conversationRoutes);
apiRoute.use('/conversations', conversationKeyRoutes);
apiRoute.use('/messages', messageRoutes);
apiRoute.use('/quick-messages', quickMessageRoutes);
apiRoute.use('/quick-lessons', quickLessonRoutes);
apiRoute.use('/admin', adminRoutes);
apiRoute.use('/admin/user-management', adminUserRoutes);
apiRoute.use('/notices', noticeRoutes);
apiRoute.use('/notifications', notificationRoutes);
apiRoute.use('/files', fileRoutes);
apiRoute.use('/social', socialRoutes);
apiRoute.use('/site-security', siteSecurityRoutes);
apiRoute.use('/conversation-keys', conversationKeyRoutes);
apiRoute.use('/reports', reportRoutes);
apiRoute.use('/permissions', permissionRoutes);

// Health check
apiRoute.get('/health', (_req, res) => res.status(200).json({ success: true, message: 'Server is healthy' }));

// 404 handler
apiRoute.use((_req, res) =>
  res.status(404).json({ success: false, message: 'Route not found' })
);

export default apiRoute;
