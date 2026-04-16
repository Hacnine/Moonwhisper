import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import axios from "axios";
import { BASE_URL, AUTH_URL } from "../../utils/baseUrls";

export const conversationApi = createApi({
  reducerPath: "conversationApi",
  baseQuery: fetchBaseQuery({
    baseUrl: `${BASE_URL}conversations`,
    credentials: "include",
  }),
  tagTypes: [
    "Conversation",
    "ThemeIndex",
    "Messages",
    "GroupRequests",
    "ClassRequests",
    "PendingConversations",
    "UnreadRequestCount",
  ],
  endpoints: (builder) => ({
    // Create conversation
    createConversation: builder.mutation({
      query: ({ receiverId }) => ({
        url: `/`,
        method: "POST",
        body: { receiverId },
      }),
      invalidatesTags: ["Conversation"],
    }),

    // Get all conversations for a user
    getAllConversations: builder.query({
      query: (userId) => ({
        url: `/${userId}`,
      }),
      providesTags: ["Conversation"],
    }),

    // Create group
    createGroup: builder.mutation({
      query: (groupData) => ({
        url: `/create-group`,
        method: "POST",
        body: groupData,
      }),
      invalidatesTags: ["Conversation"],
    }),

    // Search groups
    searchGroups: builder.query({
      query: ({ query, page, limit }) => ({
        url: "/search-groups",
        params: { query, page, limit },
      }),
    }),

    // Get conversation by chat ID
    fetchConversationById: builder.query({
      query: ({ chatId, userId }) => ({
        url: `/chat/${chatId}`,
        params: { userId },
      }),
      providesTags: ["Conversation", "ThemeIndex"],
    }),

    // Update message request status
    updateMessageRequestStatus: builder.mutation({
      query: ({ conversationId, status }) => ({
        url: `/update-message-request-status/${conversationId}`,
        method: "PATCH",
        body: { status },
      }),
      invalidatesTags: ["Conversation"],
    }),

    // Update theme index
    updateConversationThemeIndex: builder.mutation({
      query: ({ id, themeIndex }) => ({
        url: `/${id}/theme-index`,
        method: "PATCH",
        body: { themeIndex },
      }),
      invalidatesTags: ["ThemeIndex"],
    }),

    // Delete conversation
    deleteConversation: builder.mutation({
      query: (conversationId) => ({
        url: `/conversation/${conversationId}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Conversation"],
    }),

    // Leave conversation
    leaveConversation: builder.mutation({
      query: (conversationId) => ({
        url: `/leave/${conversationId}`,
        method: "POST",
      }),
      invalidatesTags: ["Conversation"],
    }),

    // Get group requests
    getGroupRequests: builder.query({
      query: ({ page, limit }) => ({
        url: `/groups`,
        params: { page, limit },
      }),
      providesTags: ["GroupRequests"],
    }),

    // Handle group request action (approve/reject)
    handleGroupRequest: builder.mutation({
      query: ({ id, actionType }) => ({
        url: `/requests/${id}/${actionType}`,
        method: "POST",
      }),
      invalidatesTags: [""],
    }),

    // Get class requests
    getClassRequests: builder.query({
      query: ({ page, limit }) => ({
        url: `/classes`,
        params: { page, limit },
      }),
      providesTags: ["ClassRequests"],
    }),

    // Get pending conversations
    getPendingConversations: builder.query({
      query: ({ page, limit }) => ({
        url: `/pending`,
        params: { page, limit },
      }),
    }),

    // Get unread request count
    getUnreadRequestCount: builder.query({
      query: () => ({
        url: `/get-unread-request-count`,
      }),
      providesTags: ["UnreadRequestCount"],
    }),

    // Get disappearing messages setting
    getDisappearingMessages: builder.query({
      query: (conversationId) => ({
        url: `/${conversationId}/disappearing-messages`,
      }),
      providesTags: ["DisappearingMessages"],
    }),

    // Update disappearing messages setting
    updateDisappearingMessages: builder.mutation({
      query: ({ conversationId, autoDeleteMessagesAfter }) => ({
        url: `/${conversationId}/disappearing-messages`,
        method: "PATCH",
        body: { autoDeleteMessagesAfter },
      }),
      invalidatesTags: ["DisappearingMessages"],
    }),

    // Update group image
    updateGroupImage: builder.mutation({
      query: ({ conversationId, image }) => ({
        url: `/${conversationId}/image`,
        method: "PATCH",
        body: { image },
      }),
      invalidatesTags: ["Conversation"],
    }),

    // Report a conversation
    reportConversation: builder.mutation({
      query: ({ conversationId, reason, details }) => ({
        url: `/reports/conversation/${conversationId}`,
        method: "POST",
        body: { reason, details },
      }),
    }),

    // (permission endpoints moved to permissionApi)
  }),
});

export const {
  useCreateConversationMutation,
  useGetAllConversationsQuery,
  useCreateGroupMutation,
  useSearchGroupsQuery,
  useFetchConversationByIdQuery,
  useUpdateMessageRequestStatusMutation,
  useUpdateConversationThemeIndexMutation,
  useDeleteConversationMutation,
  useLeaveConversationMutation,
  useGetGroupRequestsQuery,
  useHandleGroupRequestMutation,
  useGetClassRequestsQuery,
  useGetPendingConversationsQuery,
  useGetUnreadRequestCountQuery,
  useGetDisappearingMessagesQuery,
  useUpdateDisappearingMessagesMutation,
  useUpdateGroupImageMutation,
  useReportConversationMutation,
  // permission hooks moved to permissionApi
} = conversationApi;
