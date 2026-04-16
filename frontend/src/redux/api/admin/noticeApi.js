import { BASE_URL } from "@/utils/baseUrls";
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

const baseQuery = fetchBaseQuery({
  baseUrl: `${BASE_URL}notices/`,
  credentials: "include",
});

export const noticeApi = createApi({
  reducerPath: "noticeApi",
  baseQuery,
  tagTypes: ["Notice"],
  endpoints: (builder) => ({
    // Get all notices
    getNotices: builder.query({
      query: () => "",
      providesTags: ["Notice"],
    }),
    getAdminNotices: builder.query({
      query: () => "admin-notices/",
      providesTags: ["Notice"],
    }),
    // Create a new notice
    createNotice: builder.mutation({
      query: (noticeData) => ({
        url: "",
        method: "POST",
        body: noticeData, // Send targetAudience as-is (string)
      }),
      invalidatesTags: ["Notice"],
    }),
    // Update an existing notice
    updateNotice: builder.mutation({
      query: ({ noticeId, ...noticeData }) => ({
        url: `${noticeId}`,
        method: "PATCH",
        body: {
          ...noticeData,
          targetAudience: noticeData.targetAudience || "all",
        },
      }),
      invalidatesTags: ["Notice"],
    }),

    // Delete a notice
    deleteNotice: builder.mutation({
      query: (noticeId) => ({
        url: `${noticeId}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Notice"],
    }),

    markNoticeAsRead: builder.mutation({
      query: (noticeId) => ({
        url: `${noticeId}/read`,
        method: "POST",
      }),
    }),
    resetUnreadCount: builder.mutation({
      query: () => ({
        url: "reset-unread",
        method: "POST",
      }),
    }),
    toggleLikeNotice: builder.mutation({
      query: (noticeId) => ({
        url: `${noticeId}/like`,
        method: "POST",
      }),
    }),
  }),
});

export const {
  useGetNoticesQuery,
  useGetAdminNoticesQuery,
  useCreateNoticeMutation,
  useUpdateNoticeMutation,
  useDeleteNoticeMutation,
  useMarkNoticeAsReadMutation,
  useResetUnreadCountMutation,
  useToggleLikeNoticeMutation,
} = noticeApi;
