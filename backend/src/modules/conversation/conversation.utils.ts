/**
 * Utility functions to format Prisma conversation objects into the
 * shape the frontend expects (matching the old MongoDB response format).
 */

/** Format a single participant from the Prisma join-table shape to flat { id, name, image } */
function flattenParticipant(p: any) {
  return {
    id: p.user?.id ?? p.userId,
    name: p.user?.name ?? '',
    image: p.user?.image ?? '',
  };
}

/**
 * Format a full conversation detail response (used by getConversationById).
 * Returns the nested `group`, `blockList`, flat `participants`, and `receiverId`
 * that the frontend ChatTab.jsx expects.
 */
export function formatConversationDetail(conversation: any, userId: string) {
  const participants = (conversation.participants ?? []).map(flattenParticipant);

  // Build the `group` object the frontend expects
  const group = {
    is_group: conversation.isGroup ?? false,
    name: conversation.groupName ?? null,
    type: conversation.groupType ?? null,
    image: conversation.groupImage ?? '/images/cover/default-cover.jpg',
    intro: conversation.groupIntro ?? null,
    admins: (conversation.admins ?? []).map((a: any) => ({
      id: a.user?.id ?? a.userId,
      name: a.user?.name ?? '',
      image: a.user?.image ?? '',
    })),
    moderators: (conversation.moderators ?? []).map((m: any) => ({
      id: m.user?.id ?? m.userId,
      name: m.user?.name ?? '',
      image: m.user?.image ?? '',
    })),
    fileSendingAllowed: conversation.fileSendingAllowed ?? false,
    startTime: conversation.startTime ?? '09:00',
    cutoffTime: conversation.cutoffTime ?? '09:15',
    checkInterval: conversation.checkInterval ?? 15,
    selectedDays: (conversation.selectedDays ?? []).map((d: any) => d.day ?? d),
    participants: participants,
  };

  // Build blockList in the shape: [{ blockedBy, blockedUser, blockedAt }]
  const blockList = (conversation.blockList ?? []).map((b: any) => ({
    blockedBy: b.blockedById,
    blockedUser: b.blockedUserId,
    blockedAt: b.blockedAt,
  }));

  // For 1-to-1 conversations, compute receiverId as the other participant
  const receiverId = !conversation.isGroup
    ? participants.find((p: any) => p.id !== userId)?.id ?? null
    : null;

  return {
    id: conversation.id,
    status: conversation.status,
    visibility: conversation.visibility,
    themeIndex: conversation.themeIndex ?? 0,
    group,
    blockList,
    participants,
    receiverId,
    // Keep explicit sender meta for pending requests to avoid index/order dependencies
    lastMessageSenderId: conversation.lastMessageSenderId ?? null,
    autoDeleteMessagesAfter: conversation.autoDeleteMessagesAfter ?? 24,
    keyExchangeStatus: conversation.keyExchangeStatus ?? 'none',
    keyExchangeData: conversation.keyExchangeData ?? null,
    v1Keys: conversation.v1Keys ?? null,
    smteKeyVersion: conversation.smteKeyVersion ?? 0,
    messagePermissions: {
      text: conversation.permText ?? true,
      image: conversation.permImage ?? true,
      voice: conversation.permVoice ?? false,
      video: conversation.permVideo ?? false,
      file: conversation.permFile ?? false,
      sticker: conversation.permSticker ?? true,
      gif: conversation.permGif ?? true,
    },
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
}

/**
 * Format a conversation for the list view (used by getAllConversations).
 * Returns the flat structure with `conversationType`, `name`, `image`,
 * `last_message`, `unreadMessages` that ConversationCard.jsx expects.
 */
export function formatConversationList(conversation: any, userId: string) {
  const participants = (conversation.participants ?? []).map(flattenParticipant);

  // Compute unread count for this user
  const unreadEntry = (conversation.unreadEntries ?? []).find(
    (e: any) => e.userId === userId
  );
  const unreadCount = unreadEntry?.count ?? 0;

  // Build last_message in the shape: { message, sender, timestamp }
  const last_message = conversation.lastMessageText
    ? {
        message: conversation.lastMessageText,
        sender: conversation.lastMessageSenderId,
        timestamp: conversation.lastMessageTimestamp,
      }
    : null;

  if (conversation.isGroup) {
    return {
      id: conversation.id,
      name: conversation.groupName ?? 'Unnamed Group',
      image: conversation.groupImage ?? '/images/cover/default-group.png',
      last_message,
      is_group: true,
      conversationType: conversation.groupType ?? 'group',
      participants,
      unreadMessages: unreadCount,
      group: {
        is_group: true,
        name: conversation.groupName ?? 'Unnamed Group',
        type: conversation.groupType ?? 'group',
        image: conversation.groupImage ?? '/images/cover/default-group.png',
      },
      status: conversation.status,
      groupType: conversation.groupType,
      themeIndex: conversation.themeIndex ?? 0,
    };
  } else {
    return {
      id: conversation.id,
      status: conversation.status,
      last_message,
      is_group: false,
      conversationType: 'one to one',
      participants,
      unreadMessages: unreadCount,
      group: {
        is_group: false,
      },
      themeIndex: conversation.themeIndex ?? 0,
    };
  }
}
