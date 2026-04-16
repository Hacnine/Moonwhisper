import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { BASE_URL } from '../../utils/baseUrls';

export const quickMessageApi = createApi({
  reducerPath: 'quickMessageApi',
  baseQuery: fetchBaseQuery({
    baseUrl: BASE_URL,
    credentials: 'include',
  }),
  tagTypes: ['QuickMessage'],
  endpoints: (builder) => ({
    fetchQuickMessages: builder.query({
      query: () => ({
        url: 'quick-messages',
        method: 'GET',
      }),
      providesTags: ['QuickMessage'],
    }),
    addQuickMessage: builder.mutation({
      query: (quickMessage) => ({
        url: 'quick-messages',
        method: 'POST',
        body: quickMessage,
      }),
      invalidatesTags: ['QuickMessage'],
    }),
    editQuickMessage: builder.mutation({
      query: ({ id, ...update }) => ({
        url: `quick-messages/${id}`,
        method: 'PUT',
        body: update,
      }),
      invalidatesTags: ['QuickMessage'],
    }),
    deleteQuickMessage: builder.mutation({
      query: (id) => ({
        url: `quick-messages/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['QuickMessage'],
    }),
  }),
});

export const {
  useFetchQuickMessagesQuery,
  useAddQuickMessageMutation,
  useEditQuickMessageMutation,
  useDeleteQuickMessageMutation,
} = quickMessageApi;