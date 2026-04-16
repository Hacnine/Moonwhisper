import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { BASE_URL } from "@/utils/baseUrls";

/**
 * User Management API slice for CRUD operations on users
 */
export const userManagementApi = createApi({
  reducerPath: "userManagementApi",
  baseQuery: fetchBaseQuery({
    baseUrl: `${BASE_URL}admin/user-management`,
    credentials: "include",
  }),
  tagTypes: ["User", "ScheduledDeletion", "InactiveUser", "UserList"],
  endpoints: (builder) => ({
    // Get All Users
    getAllUsers: builder.query({
      query: ({ page = 1, limit = 20, search, status, role } = {}) => {
        const params = new URLSearchParams({
          page: page.toString(),
          limit: limit.toString(),
        });
        if (search) params.append("search", search);
        if (status) params.append("status", status);
        if (role) params.append("role", role);

        return `/users?${params.toString()}`;
      },
      providesTags: (result) =>
        result
          ? [
              ...result.users.map(({ id }) => ({ type: "User", id: id })),
              { type: "UserList", id: "LIST" },
            ]
          : [{ type: "UserList", id: "LIST" }],
    }),

    // Create User
    createUser: builder.mutation({
      query: (userData) => ({
        url: "/create",
        method: "POST",
        body: userData,
      }),
      invalidatesTags: [{ type: "UserList", id: "LIST" }, "DashboardStats"],
    }),

    // Update User
    updateUser: builder.mutation({
      query: ({ userId, ...userData }) => ({
        url: `/${userId}`,
        method: "PUT",
        body: userData,
      }),
      invalidatesTags: (result, error, { userId }) => [
        { type: "User", id: userId },
        { type: "UserList", id: "LIST" },
      ],
    }),

    // Delete User
    deleteUser: builder.mutation({
      query: ({ userId, reason }) => ({
        url: `/${userId}`,
        method: "DELETE",
        body: { reason },
      }),
      invalidatesTags: (result, error, { userId }) => [
        { type: "User", id: userId },
        { type: "UserList", id: "LIST" },
        "DashboardStats",
      ],
    }),

    // Block User
    blockUser: builder.mutation({
      query: ({ userId, reason, duration }) => ({
        url: `/${userId}/block`,
        method: "POST",
        body: { reason, duration },
      }),
      invalidatesTags: (result, error, { userId }) => [
        { type: "User", id: userId },
        { type: "UserList", id: "LIST" },
      ],
    }),

    // Unblock User
    unblockUser: builder.mutation({
      query: ({ userId }) => ({
        url: `/${userId}/unblock`,
        method: "POST",
      }),
      invalidatesTags: (result, error, { userId }) => [
        { type: "User", id: userId },
        { type: "UserList", id: "LIST" },
      ],
    }),

    // Reset User Password
    resetUserPassword: builder.mutation({
      query: ({ userId, newPassword }) => ({
        url: `/${userId}/reset-password`,
        method: "POST",
        body: { newPassword },
      }),
      invalidatesTags: (result, error, { userId }) => [
        { type: "User", id: userId },
      ],
    }),

    // Get Scheduled Deletions
    getScheduledDeletions: builder.query({
      query: ({ page = 1, limit = 20 } = {}) =>
        `/scheduled-deletions?page=${page}&limit=${limit}`,
      providesTags: (result) =>
        result
          ? [
              ...result.deletions.map(({ id }) => ({
                type: "ScheduledDeletion",
                id: id,
              })),
              { type: "ScheduledDeletion", id: "LIST" },
            ]
          : [{ type: "ScheduledDeletion", id: "LIST" }],
      pollingInterval: 60000, // Refetch every minute
    }),

    // Prevent Deletion
    preventDeletion: builder.mutation({
      query: ({ scheduleId, reason }) => ({
        url: `/scheduled-deletions/${scheduleId}/prevent`,
        method: "POST",
        body: { reason },
      }),
      invalidatesTags: (result, error, { scheduleId }) => [
        { type: "ScheduledDeletion", id: scheduleId },
        { type: "ScheduledDeletion", id: "LIST" },
        "DashboardStats",
      ],
    }),

    // Reschedule Deletion
    rescheduleDeletion: builder.mutation({
      query: ({ scheduleId }) => ({
        url: `/scheduled-deletions/${scheduleId}/reschedule`,
        method: "POST",
      }),
      invalidatesTags: (result, error, { scheduleId }) => [
        { type: "ScheduledDeletion", id: scheduleId },
        { type: "ScheduledDeletion", id: "LIST" },
      ],
    }),

    // Get Inactive Users
    getInactiveUsers: builder.query({
      query: ({ months = 6 } = {}) => `/inactive?months=${months}`,
      providesTags: ["InactiveUser"],
      pollingInterval: 300000, // Refetch every 5 minutes
    }),
  }),
});

export const {
  useGetAllUsersQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useDeleteUserMutation,
  useBlockUserMutation,
  useUnblockUserMutation,
  useResetUserPasswordMutation,
  useGetScheduledDeletionsQuery,
  usePreventDeletionMutation,
  useRescheduleDeletionMutation,
  useGetInactiveUsersQuery,
} = userManagementApi;
