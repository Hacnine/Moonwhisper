-- AlterTable
ALTER TABLE `notices` MODIFY `targetAudience` ENUM('all', 'user', 'admin', 'superadmin', 'moderator', 'teacher') NOT NULL;

-- AlterTable
ALTER TABLE `notifications` MODIFY `type` ENUM('assignment', 'grade', 'class_invite', 'join_request', 'message', 'system', 'notice', 'friend_request', 'friend_accept', 'like', 'mention', 'comment', 'admin_alert', 'role_change', 'account_action', 'reminder', 'attendance', 'form', 'permission', 'report') NOT NULL;
