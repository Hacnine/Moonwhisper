import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { BASE_URL } from "../../utils/baseUrls";

export const messageApi = createApi({
  reducerPath: "messageApi",
  baseQuery: fetchBaseQuery({
    baseUrl: `${BASE_URL}messages`,
    credentials: "include",
  }),
  tagTypes: ["GetMessage, GetImageMessage, Message", "Conversation"],
  endpoints: (builder) => ({
    // GET /messages/:conversationId?page=1&limit=20
    getMessages: builder.query({
      query: ({ conversationId, userId, page = 1, limit = 20 }) => ({
        url: `/get-messages/${conversationId}?userId=${userId}&page=${page}&limit=${limit}`,
        method: "GET",
      }),
      providesTags: ["GetMessage"],
    }),

    getImageMessages: builder.query({
      query: ({
        conversationId,
        cursor = null,
        limit = 5,
        direction = "older",
      }) => {
        const params = new URLSearchParams({
          ...(cursor && { cursor }),
          limit,
          direction,
        });

        return {
          url: `/${conversationId}/images?${params.toString()}`,
          method: "GET",
        };
      },
      providesTags: ["GetImageMessage"],
    }),

    // POST /messages/send (new) or /messages/send/:conversationId (existing)
    sendMessage: builder.mutation({
      query: ({ conversationId, data }) => ({
        url: conversationId ? `/send/${conversationId}` : `/send`,
        method: "POST",
        body: data, // Expects FormData for files or JSON for text
      }),
      invalidatesTags: ["Message", "Conversation"],
    }),

    sendEmoji: builder.mutation({
      query: ({ conversationId, data }) => ({
        url: conversationId ? `/send-emoji/${conversationId}` : `/send-emoji`,
        method: "POST",
        body: data, // Expects FormData for files or JSON for text
      }),
      invalidatesTags: ["Message", "Conversation"],
    }),

    // PUT /messages/edit-message/:messageId
    editMessage: builder.mutation({
      query: ({ messageId, text }) => ({
        url: `/edit-message/${messageId}`,
        method: "PUT",
        body: { text },
      }),
      invalidatesTags: ["Message"],
    }),

    // DELETE /messages/delete/:messageId
    deleteMessage: builder.mutation({
      query: (messageId) => ({
        url: `/delete/${messageId}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Message"],
    }),

    // POST /messages/:conversationId/reply/:messageId
    replyMessage: builder.mutation({
      query: ({ conversationId, messageId, data }) => ({
        url: `/${conversationId}/reply/${messageId}`,
        method: "POST",
        body: data, // Expects FormData for files or JSON for text
      }),
      invalidatesTags: ["Message", "Conversation"],
    }),

    // PUT /messages/:conversationId/read
    markMessagesAsRead: builder.mutation({
      query: (conversationId) => ({
        url: `/${conversationId}/read`,
        method: "PUT",
      }),
      invalidatesTags: ["Message", "Conversation"],
    }),
  }),
});

export const {
  useGetMessagesQuery,
  useGetImageMessagesQuery,
  useSendMessageMutation,
  useSendEmojiMutation,
  useEditMessageMutation,
  useDeleteMessageMutation,
  useReplyMessageMutation,
  useMarkMessagesAsReadMutation,
} = messageApi;
