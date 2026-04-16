import { BASE_URL } from "@/utils/baseUrls";
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

const baseQuery = fetchBaseQuery({
  baseUrl: `${BASE_URL}notifications/`,
  credentials: "include",
});

export const notificationApi = createApi({
  reducerPath: "notificationApi",
  baseQuery,
  tagTypes: ["Notification"],
  endpoints: (builder) => ({
    // Get paginated notifications (supports ?page, ?limit, ?unreadOnly, ?type)
    getNotifications: builder.query({
      query: ({ page = 1, limit = 30, unreadOnly = false, type } = {}) => {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", String(limit));
        if (unreadOnly) params.set("unreadOnly", "true");
        if (type) params.set("type", type);
        return `?${params.toString()}`;
      },
      providesTags: ["Notification"],
    }),

    // Get unread count
    getUnreadCount: builder.query({
      query: () => "unread/count",
      providesTags: ["Notification"],
    }),

    // Mark single as read
    markAsRead: builder.mutation({
      query: (id) => ({
        url: `${id}/read`,
        method: "PUT",
      }),
      invalidatesTags: ["Notification"],
    }),

    // Mark all as read
    markAllAsRead: builder.mutation({
      query: () => ({
        url: "read-all",
        method: "PUT",
      }),
      invalidatesTags: ["Notification"],
    }),

    // Delete single notification
    deleteNotification: builder.mutation({
      query: (id) => ({
        url: `${id}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Notification"],
    }),

    // Clear all notifications
    clearAll: builder.mutation({
      query: () => ({
        url: "clear-all",
        method: "DELETE",
      }),
      invalidatesTags: ["Notification"],
    }),
  }),
});

export const {
  useGetNotificationsQuery,
  useGetUnreadCountQuery,
  useMarkAsReadMutation,
  useMarkAllAsReadMutation,
  useDeleteNotificationMutation,
  useClearAllMutation,
} = notificationApi;
