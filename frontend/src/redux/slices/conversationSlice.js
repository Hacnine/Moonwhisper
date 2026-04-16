import { createSlice } from "@reduxjs/toolkit";
import {
  conversationApi,
  useGetAllConversationsQuery,
} from "../api/conversationApi";
import { messageApi } from "../api/messageApi";
import { userApi } from "../api/user/userApi";
import { useSelector } from "react-redux";

const initialState = {
  allConversations: [],
  themeIndex: 0,
  conversationId: null,
  conversationStatus: null,
  allParticipants: [],
  conversations: [],
  oneToOneConversations: [],
  groupConversations: [],
  classroomConversations: [],
  receiver: null,
  byConversationId: {},
  isGroup: false,
  participant: [],
  blockList: [],
  loading: false,
  error: null,
};

const conversationSlice = createSlice({
  name: "conversation",
  initialState,
  reducers: {
    setAllConversations(state, action) {
      state.allConversations = action.payload;
    },
    setThemeIndex(state, action) {
      state.themeIndex = action.payload;
    },
    setConversationStatus(state, action) {
      state.conversationStatus = action.payload;
    },
    // setAllConversations(state, action) {
    //   state.allParticipants = action.payload;
    // },
    setConversationId(state, action) {
      state.conversationId = action.payload;
    },
    setReceiver(state, action) {
      state.receiver = action.payload;
    },
    setParticipant(state, action) {
      state.participant = action.payload;
    },
    migrateNewConversation(state, action) {
      const newConversationId = action.payload;
      if (state.byConversationId["new"] && newConversationId) {
        // Move all messages from "new" bucket to the real conversation bucket
        if (!state.byConversationId[newConversationId]) {
          state.byConversationId[newConversationId] = { messages: {}, sortedIds: [] };
        }
        const newBucket = state.byConversationId["new"];
        Object.entries(newBucket.messages).forEach(([id, msg]) => {
          state.byConversationId[newConversationId].messages[id] = {
            ...msg,
            conversationId: newConversationId,
            conversation: newConversationId,
          };
          if (!state.byConversationId[newConversationId].sortedIds.includes(id)) {
            state.byConversationId[newConversationId].sortedIds.push(id);
          }
        });
        state.byConversationId[newConversationId].sortedIds.sort(
          (a, b) =>
            new Date(state.byConversationId[newConversationId].messages[a].createdAt) -
            new Date(state.byConversationId[newConversationId].messages[b].createdAt)
        );
        delete state.byConversationId["new"];
      }
    },
    setBlockList(state, action) {
      state.blockList = action.payload;
    },
    addMessage(state, action) {
      const message = action.payload;

      if (!message || typeof message !== "object") {
        return;
      }

      const conversationId = message.conversationId || message.conversation || "new";
      if (!state.byConversationId[conversationId]) {
        state.byConversationId[conversationId] = {
          messages: {},
          sortedIds: [],
        };
      }
      // When storing in the "new" bucket (first message to a new user),
      // immediately set conversationId so MessageContainer can find the
      // messages on the very same render — no useEffect delay.
      if (conversationId === "new" && !state.conversationId) {
        state.conversationId = "new";
      }
      const messageId = message.clientTempId || message.id;
      // Skip if message already exists to avoid duplicate processing
      if (state.byConversationId[conversationId].messages[messageId]) {
        return;
      }
      state.byConversationId[conversationId].messages[messageId] = {
        ...message,
        createdAt: message.createdAt || new Date().toISOString(),
      };
      state.byConversationId[conversationId].sortedIds.push(messageId);
      // Use a more efficient sort by storing timestamps
      state.byConversationId[conversationId].sortedIds.sort(
        (a, b) =>
          new Date(
            state.byConversationId[conversationId].messages[a].createdAt
          ) -
          new Date(
            state.byConversationId[conversationId].messages[b].createdAt
          )
      );
    },
    updateMessage(state, action) {
      const { messageId, clientTempId, message } = action.payload;
      const conversationId =
        message?.conversationId || message?.conversation || state.conversationId || "new";

      if (!state.byConversationId[conversationId]) {
        state.byConversationId[conversationId] = {
          messages: {},
          sortedIds: [],
        };
      }

      const oldId = clientTempId || messageId;
      
      // CRITICAL: Preserve plainText from optimistic message BEFORE deleting it
      let existingPlainText = null;
      if (oldId && state.byConversationId[conversationId].messages[oldId]) {
        existingPlainText = state.byConversationId[conversationId].messages[oldId].plainText;
        
        // Preserve failed messages unless updating with a server-confirmed message
        if (
          state.byConversationId[conversationId].messages[oldId].status ===
            "fail" &&
          (!message || !message.id)
        ) {
          if (message) {
            state.byConversationId[conversationId].messages[oldId] = {
              ...state.byConversationId[conversationId].messages[oldId],
              ...message,
              // Preserve plainText even when updating failed message
              plainText: message.plainText || existingPlainText,
              conversation: conversationId,
              createdAt:
                message.createdAt ||
                state.byConversationId[conversationId].messages[oldId]
                  .createdAt,
            };
          }
          return;
        }
        delete state.byConversationId[conversationId].messages[oldId];
        state.byConversationId[conversationId].sortedIds =
          state.byConversationId[conversationId].sortedIds.filter(
            (id) => id !== oldId
          );
      }

      if (message) {
        const newId = message.id || clientTempId;
        if (!newId) {
          console.warn("No valid ID for message update:", message);
          return;
        }

        const isValid =
          message.status === "fail" ||
          ((message.text?.trim() ||
            message.media?.length > 0 ||
            message.voice ||
            message.call ||
            message.img) &&
            !message.deletedBy?.includes(state.user?.id));
        if (!isValid) {
          console.warn("Invalid message:", message);
          return;
        }

        // Use existingPlainText captured before deletion
        // ALSO check if the message already exists with plainText and preserve it
        const alreadyExistingPlainText = state.byConversationId[conversationId].messages[newId]?.plainText;
        
        state.byConversationId[conversationId].messages[newId] = {
          ...state.byConversationId[conversationId].messages[newId],
          ...message,
          // Preserve plainText: use new plainText > existing in same message > existing from optimistic message
          plainText: message.plainText || alreadyExistingPlainText || existingPlainText,
          conversation: conversationId,
          createdAt: message.createdAt || new Date().toISOString(),
        };
        
        if (!state.byConversationId[conversationId].sortedIds.includes(newId)) {
          state.byConversationId[conversationId].sortedIds.push(newId);
        }
        state.byConversationId[conversationId].sortedIds.sort(
          (a, b) =>
            new Date(
              state.byConversationId[conversationId].messages[a].createdAt
            ) -
            new Date(
              state.byConversationId[conversationId].messages[b].createdAt
            )
        );
      }
    },
    updateMessageReaction(state, action) {
      const { conversationId, messageId, clientTempId, reactions } =
        action.payload;
      const key = messageId || clientTempId;

      if (!state.byConversationId[conversationId]?.messages[key]) {
        console.warn(
          `Message not found for reaction update: conversationId=${conversationId}, key=${key}`
        );
        return;
      }

      // Validate reactions structure
      const validatedReactions = {};
      for (const [userId, reaction] of Object.entries(reactions || {})) {
        if (
          reaction &&
          typeof reaction === "object" &&
          reaction.emoji &&
          typeof reaction.emoji === "string" &&
          reaction.username &&
          typeof reaction.username === "string"
        ) {
          validatedReactions[userId] = reaction;
        } else {
          console.warn(`Invalid reaction format for user ${userId}:`, reaction);
        }
      }

      state.byConversationId[conversationId].messages[key].reactions =
        validatedReactions;
    },
    removeMessage(state, action) {
      const { conversationId, messageId } = action.payload;
      if (
        state.byConversationId[conversationId] &&
        state.byConversationId[conversationId].messages[messageId]
      ) {
        delete state.byConversationId[conversationId].messages[messageId];
        state.byConversationId[conversationId].sortedIds =
          state.byConversationId[conversationId].sortedIds.filter(
            (id) => id !== messageId
          );
      }
    },
    addMessages(state, action) {
      const { conversationId, messages } = action.payload;
      if (!Array.isArray(messages) || messages.length === 0) {
        console.warn("No valid messages to add:", messages);
        return;
      }

      if (!state.byConversationId[conversationId]) {
        state.byConversationId[conversationId] = {
          messages: {},
          sortedIds: [],
        };
      }

      messages.forEach((msg) => {
        const messageId = msg.id || msg.clientTempId;
        const isValid =
          msg &&
          messageId &&
          (msg.text?.trim() ||
            msg.media?.length > 0 ||
            msg.voice ||
            msg.call ||
            msg.img) &&
          !msg.deletedBy?.includes(state.user?.id);
        if (!isValid) {
          console.warn("Skipping invalid message:", msg);
          return;
        }
        if (!state.byConversationId[conversationId].messages[messageId]) {
          state.byConversationId[conversationId].messages[messageId] = {
            ...msg,
            conversation: conversationId,
          };
          state.byConversationId[conversationId].sortedIds.push(messageId);
        }
      });

      state.byConversationId[conversationId].sortedIds.sort(
        (a, b) =>
          new Date(
            state.byConversationId[conversationId].messages[a].createdAt
          ) -
          new Date(state.byConversationId[conversationId].messages[b].createdAt)
      );
    },
    checkScheduledDeletions(state, action) {
      const now = new Date();
      Object.keys(state.byConversationId).forEach((conversationId) => {
        const conversation = state.byConversationId[conversationId];
        const messagesToDelete = [];

        Object.entries(conversation.messages).forEach(
          ([messageId, message]) => {
            if (
              message.scheduledDeletionTime &&
              new Date(message.scheduledDeletionTime) <= now
            ) {
              messagesToDelete.push(messageId);
            }
          }
        );

        messagesToDelete.forEach((messageId) => {
          delete conversation.messages[messageId];
          conversation.sortedIds = conversation.sortedIds.filter(
            (id) => id !== messageId
          );
        });

        // Optionally dispatch an API call to notify backend or sync messages
        // if (messagesToDelete.length > 0) {
        //   action.asyncDispatch(messageApi.endpoints.deleteMessages.initiate({
        //     conversationId,
        //     messageIds: messagesToDelete,
        //   }));
        // }
      });
    },
    setIsGroup(state, action) {
      state.isGroup = action.payload;
    },
    /**
     * Update the last message for a conversation in the list
     * This is used by the GlobalMessageHandler to update conversation previews
     */
    updateConversationLastMessage(state, action) {
      const { conversationId, lastMessage, lastMessageTime } = action.payload;
      const conversationIndex = state.allConversations.findIndex(
        (c) => c.id === conversationId
      );
      if (conversationIndex !== -1) {
        state.allConversations[conversationIndex] = {
          ...state.allConversations[conversationIndex],
          last_message: {
            message: lastMessage,
            sender: action.payload.sender || state.allConversations[conversationIndex].last_message?.sender,
            timestamp: lastMessageTime || new Date().toISOString(),
          },
        };
        // Move updated conversation to top of list
        const [updatedConversation] = state.allConversations.splice(conversationIndex, 1);
        state.allConversations.unshift(updatedConversation);
      }
    },
    reset: () => initialState,
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addMatcher(
        conversationApi.endpoints.fetchConversationById.matchPending,
        (state) => {
          state.loading = true;
          state.error = null;
        }
      )
      .addMatcher(
        conversationApi.endpoints.fetchConversationById.matchFulfilled,
        (state, action) => {
          const payload = action.payload;
          state.themeIndex = payload.themeIndex ?? null;
          state.conversationId = payload.id ?? state.conversationId;
          state.receiver = payload.receiverId ?? null;
          state.isGroup = payload.group?.is_group ?? false;
          state.loading = false;
        }
      )
      .addMatcher(
        conversationApi.endpoints.fetchConversationById.matchRejected,
        (state, action) => {
          state.loading = false;
          state.error =
            action.payload?.data?.message || "Conversation fetch failed";
        }
      )
      .addMatcher(
        conversationApi.endpoints.getAllConversations.matchPending,
        (state) => {
          state.loading = true;
          state.error = null;
        }
      )
      .addMatcher(
        conversationApi.endpoints.getAllConversations.matchFulfilled,
        (state, action) => {
          state.conversations = action.payload || [];
          state.oneToOneConversations = action.payload.filter(
            (conv) => !conv.group?.is_group
          );
          state.groupConversations = action.payload.filter(
            (conv) => conv.group?.is_group && conv.group?.type === "group"
          );
          state.classroomConversations = action.payload.filter(
            (conv) => conv.group?.is_group && conv.group?.type === "classroom"
          );

          const allParticipants = state.oneToOneConversations
            .flatMap((conversation) => conversation.participants || [])
            .reduce((acc, participant) => {
              if (!acc.some((p) => p.id === participant.id)) {
                acc.push(participant);
              }
              return acc;
            }, []);

          state.allParticipants = allParticipants;
          state.loading = false;
        }
      )
      .addMatcher(
        conversationApi.endpoints.getAllConversations.matchRejected,
        (state, action) => {
          state.loading = false;
          state.error =
            action.payload?.data?.message || "Failed to fetch conversations";
        }
      )
      .addMatcher(messageApi.endpoints.getMessages.matchPending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addMatcher(
        messageApi.endpoints.getMessages.matchFulfilled,
        (state, action) => {
          const { conversationId, messages } = action.payload;
          if (!state.byConversationId[conversationId]) {
            state.byConversationId[conversationId] = {
              messages: {},
              sortedIds: [],
            };
          }

          messages.forEach((msg) => {
            const messageId = msg.id || msg.clientTempId;
            const isValid =
              msg &&
              messageId &&
              (msg.text?.trim() ||
                msg.media?.length > 0 ||
                msg.voice ||
                msg.call ||
                msg.img) &&
              !msg.deletedBy?.includes(state.user?.id);
            if (!isValid) {
              console.warn("Skipping invalid message:", msg);
              return;
            }
            if (!state.byConversationId[conversationId].messages[messageId]) {
              state.byConversationId[conversationId].messages[messageId] = {
                ...msg,
                conversation: conversationId,
              };
              state.byConversationId[conversationId].sortedIds.push(messageId);
            }
          });

          state.byConversationId[conversationId].sortedIds.sort(
            (a, b) =>
              new Date(
                state.byConversationId[conversationId].messages[a].createdAt
              ) -
              new Date(
                state.byConversationId[conversationId].messages[b].createdAt
              )
          );

          state.loading = false;
        }
      )
      .addMatcher(
        messageApi.endpoints.getMessages.matchRejected,
        (state, action) => {
          state.loading = false;
          state.error =
            action.payload?.data?.message || "Failed to fetch messages";
        }
      )
      .addMatcher(userApi.endpoints.logout.matchFulfilled, () => initialState);
  },
});

export const {
  setAllConversations,
  setThemeIndex,
  setConversationId,
  setConversationStatus,
  setReceiver,
  addMessage,
  updateMessage,
  updateMessageReaction,
  removeMessage,
  addMessages,
  setIsGroup,
  setParticipant,
  setBlockList,
  migrateNewConversation,
  updateConversationLastMessage,
  reset,
  clearError,
  checkScheduledDeletions,
} = conversationSlice.actions;

export default conversationSlice.reducer;

export const selectThemeIndex = (state) => state.conversation.themeIndex;
export const selectConversationId = (state) =>
  state.conversation.conversationId;
export const selectReceiver = (state) => state.conversation.receiver;
export const selectByConversationId = (state) =>
  state.conversation.byConversationId;
export const selectIsGroup = (state) => state.conversation.isGroup;
export const selectConversationLoading = (state) => state.conversation.loading;
export const selectConversationError = (state) => state.conversation.error;
export const selectConversations = (state) => state.conversation.conversations;
export const selectOneToOneConversations = (state) =>
  state.conversation.oneToOneConversations;
export const selectGroupConversations = (state) =>
  state.conversation.groupConversations;
export const selectClassroomConversations = (state) =>
  state.conversation.classroomConversations;

export const useConversation = () => useSelector((state) => state.conversation);
