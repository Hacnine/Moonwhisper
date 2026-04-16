import { BASE_URL } from "@/utils/baseUrls";
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

export const adminApi = createApi({
  reducerPath: "adminApi",
  baseQuery: fetchBaseQuery({
    baseUrl: `${BASE_URL}admin`,
    credentials: "include",
  }),
  tagTypes: [
    "DashboardStats",
    "SystemHealth",
    "ActivityLogs",
    "PendingApprovals",
    "UserApproval",
  ],
  endpoints: (builder) => ({
    // Dashboard Statistics
    getDashboardStats: builder.query({
      query: () => "/dashboard/stats",
      providesTags: ["DashboardStats"],
      // Refetch every 30 seconds
      pollingInterval: 30000,
    }),

    // System Health
    getSystemHealth: builder.query({
      query: () => "/system/health",
      providesTags: ["SystemHealth"],
      pollingInterval: 60000, // Refetch every minute
    }),

    // Pending Approvals
    getPendingApprovals: builder.query({
      query: ({ page = 1, limit = 20 } = {}) =>
        `/approvals/pending?page=${page}&limit=${limit}`,
      providesTags: (result) =>
        result
          ? [
              ...result.approvals.map(({ id }) => ({
                type: "PendingApprovals",
                id: id,
              })),
              { type: "PendingApprovals", id: "LIST" },
            ]
          : [{ type: "PendingApprovals", id: "LIST" }],
    }),

    // Approve User
    approveUser: builder.mutation({
      query: ({ approvalId, notes }) => ({
        url: `/approvals/${approvalId}/approve`,
        method: "POST",
        body: { notes },
      }),
      invalidatesTags: (result, error, { approvalId }) => [
        { type: "PendingApprovals", id: approvalId },
        { type: "PendingApprovals", id: "LIST" },
        "DashboardStats",
      ],
    }),

    // Reject User
    rejectUser: builder.mutation({
      query: ({ approvalId, reason }) => ({
        url: `/approvals/${approvalId}/reject`,
        method: "POST",
        body: { reason },
      }),
      invalidatesTags: (result, error, { approvalId }) => [
        { type: "PendingApprovals", id: approvalId },
        { type: "PendingApprovals", id: "LIST" },
        "DashboardStats",
      ],
    }),

    // Activity Logs
    getActivityLogs: builder.query({
      query: ({ page = 1, limit = 50, action, severity, admin } = {}) => {
        const params = new URLSearchParams({
          page: page.toString(),
          limit: limit.toString(),
        });
        if (action) params.append("action", action);
        if (severity) params.append("severity", severity);
        if (admin) params.append("admin", admin);

        return `/logs?${params.toString()}`;
      },
      providesTags: ["ActivityLogs"],
    }),
  }),
});

export const {
  useGetDashboardStatsQuery,
  useGetSystemHealthQuery,
  useGetPendingApprovalsQuery,
  useApproveUserMutation,
  useRejectUserMutation,
  useGetActivityLogsQuery,
} = adminApi;
