import { Router } from 'express';
import { isLogin } from '../../middlewares/auth.middleware.js';
import { upload } from '../../middlewares/multerConfig.js';
import {
  sendFileMessage,
  editMessage,
  deleteMessage,
  replyMessage,
  getMessages,
  markMessagesAsRead,
  handleSendEmojiApi,
  getConversationImages,
} from './message.controller.js';

const router = Router();

router.post('/send', isLogin, upload.any(), sendFileMessage);
router.post('/send/:conversationId', isLogin, upload.any(), sendFileMessage);
router.post('/send-emoji', isLogin, handleSendEmojiApi);
router.post('/send-emoji/:conversationId', isLogin, handleSendEmojiApi);

router.put('/edit-message/:messageId', isLogin, editMessage);
router.delete('/delete/:messageId', isLogin, (req, res) => {
  deleteMessage({ io: (req as any).io, socket: null, messageId: req.params.messageId, userId: (req as any).user.id, req, res });
});
router.post('/:conversationId/reply/:messageId', isLogin, upload.any(), replyMessage);

router.get('/get-messages/:conversationId/', isLogin, getMessages);
router.get('/:conversationId/images', getConversationImages);
router.put('/:conversationId/read', isLogin, async (req, res) => {
  await markMessagesAsRead(req.params.conversationId as string, (req as any).user.id, (req as any).io);
  res.status(200).json({ message: 'Messages marked as read' });
});

export default router;
