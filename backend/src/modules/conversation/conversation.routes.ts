import { Router } from 'express';
import {
  acceptMessageRequest, createConversation, createGroup, deleteConversation,
  getAllConversations, getConversationById, getGroupJoinRequests,
  getPendingConversationRequests, getUnreadRequestCounts, searchGroups,
  updateConversationThemeIndex, updateDisappearingMessages, getDisappearingMessages,
  updateGroupImage, leaveConversation,
} from './conversation.controller.js';
import { isLogin } from '../../middlewares/auth.middleware.js';

const router = Router();
router.use(isLogin);

router.post('/', createConversation);
router.post('/create-group', createGroup);
router.get('/chat/:chatId', getConversationById);
router.get('/get-unread-request-count', getUnreadRequestCounts);
router.get('/search-groups', searchGroups);

router.patch('/update-message-request-status/:conversationId', acceptMessageRequest);
router.patch('/:conversationId/image', updateGroupImage);
router.patch('/:id/theme-index', updateConversationThemeIndex);
router.patch('/:id/disappearing-messages', updateDisappearingMessages);
router.get('/:id/disappearing-messages', getDisappearingMessages);
router.delete('/conversation/:id', deleteConversation);
router.post('/leave/:id', leaveConversation);

router.get('/pending', getPendingConversationRequests);
router.get('/groups', getGroupJoinRequests);

router.get('/:userId', getAllConversations);

export default router;
