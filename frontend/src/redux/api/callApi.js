import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

const CALLING_BASE_URL = import.meta.env.VITE_CALLING_URL || '/calling-api/';

export const callApi = createApi({
  reducerPath: 'callApi',
  baseQuery: fetchBaseQuery({
    baseUrl: CALLING_BASE_URL,
    credentials: 'include',
  }),
  tagTypes: ['CallHistory', 'MissedCalls'],
  endpoints: (builder) => ({
    // Get call history (paginated)
    getCallHistory: builder.query({
      query: ({ page = 1, limit = 20 } = {}) => `calls/history?page=${page}&limit=${limit}`,
      providesTags: ['CallHistory'],
    }),

    // Get missed calls
    getMissedCalls: builder.query({
      query: () => 'calls/missed',
      providesTags: ['MissedCalls'],
    }),

    // Get active call
    getActiveCall: builder.query({
      query: () => 'calls/active',
    }),

    // Get call history for a conversation
    getConversationCalls: builder.query({
      query: ({ conversationId, page = 1, limit = 10 }) =>
        `calls/conversation/${conversationId}?page=${page}&limit=${limit}`,
      providesTags: (result, error, { conversationId }) => [
        { type: 'CallHistory', id: conversationId },
      ],
    }),

    // Get a specific call
    getCallById: builder.query({
      query: (callId) => `calls/${callId}`,
    }),
  }),
});

export const {
  useGetCallHistoryQuery,
  useGetMissedCallsQuery,
  useGetActiveCallQuery,
  useGetConversationCallsQuery,
  useGetCallByIdQuery,
} = callApi;
