// API service for conversation key exchange
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

import { BASE_URL } from '@/utils/baseUrls';

export const conversationKeyApi = createApi({
  reducerPath: 'conversationKeyApi',
  baseQuery: fetchBaseQuery({
    baseUrl: `${BASE_URL}conversations/`,
    credentials: 'include',
  }),
  tagTypes: ['ConversationKeys'],
  endpoints: (builder) => ({
    
    // Exchange public key for a conversation
    exchangeConversationKey: builder.mutation({
      query: ({ conversationId, publicKey }) => ({
        url: `${conversationId}/key-exchange`,
        method: 'POST',
        body: { publicKey },
      }),
      invalidatesTags: ['ConversationKeys'],
    }),

    // Get all participants' keys for a conversation
    getConversationKeys: builder.query({
      query: (conversationId) => ({
        url: `${conversationId}/keys`,
        method: 'GET',
      }),
      providesTags: ['ConversationKeys'],
    }),

    // Get specific participant's key
    getParticipantKey: builder.query({
      query: ({ conversationId, userId }) => ({
        url: `${conversationId}/keys/${userId}`,
        method: 'GET',
      }),
      providesTags: ['ConversationKeys'],
    }),

    // Rotate user's key for a conversation
    rotateConversationKey: builder.mutation({
      query: ({ conversationId, newPublicKey }) => ({
        url: `${conversationId}/key-rotate`,
        method: 'PUT',
        body: { newPublicKey },
      }),
      invalidatesTags: ['ConversationKeys'],
    }),

  }),
});

export const {
  useExchangeConversationKeyMutation,
  useGetConversationKeysQuery,
  useGetParticipantKeyQuery,
  useLazyGetParticipantKeyQuery, // For manual triggering
  useRotateConversationKeyMutation,
} = conversationKeyApi;