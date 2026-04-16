import { BASE_URL } from "@/utils/baseUrls";
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

const baseQuery = fetchBaseQuery({
  baseUrl: `${BASE_URL}user/`,
  credentials: "include",
});

export const userApi = createApi({
  reducerPath: "userApi",
  baseQuery,
  tagTypes: ["User", "Theme", "Search", "Block", "Unblock"],
  endpoints: (builder) => ({
    // Get user profile (merged from both snippets, using "me" endpoint for consistency)
    getUserProfile: builder.query({
      query: () => "me",
      providesTags: ["User"],
    }),

    // Get user info by ID
    getUserInfo: builder.query({
      query: (userId) => `userinfo/${userId}`,
      providesTags: (result, error, userId) => [{ type: "User", id: userId }],
    }),

    // Update user profile (merged, using PATCH method from second snippet for more flexibility)
    updateUserProfile: builder.mutation({
      query: ({ userId, ...update }) => ({
        url: userId ? `update/${userId}` : "me",
        method: "PATCH",
        body: update,
      }),
      invalidatesTags: (result, error, { userId }) => [
        { type: "User", id: userId || "me" },
      ],
    }),

    // Update theme index
    updateThemeIndex: builder.mutation({
      query: (themeIndexData) => ({
        url: "theme-index",
        method: "PATCH",
        body: themeIndexData,
      }),
      invalidatesTags: ["Theme"],
    }),

    // Get theme index
    getThemeIndex: builder.query({
      query: () => "theme-index",
      providesTags: ["Theme"],
    }),

    // Search users by email
    searchUser: builder.query({
      query: ({ query, page = 1, limit = 10 }) =>
        `search-user?query=${encodeURIComponent(
          query
        )}&page=${page}&limit=${limit}`,
      transformResponse: (response) => ({
        users: response.users || [],
        total: response.total || 0,
        page: response.page || 1,
        totalPages: response.totalPages || 1,
      }),
    }),

    // Login
    login: builder.mutation({
      query: (credentials) => ({
        url: "login",
        method: "POST",
        body: credentials,
      }),
    }),

    // Register
    register: builder.mutation({
      query: (userData) => ({
        url: "register",
        method: "POST",
        body: userData,
      }),
    }),

    // Logout
    logout: builder.mutation({
      query: () => ({
        url: "logout",
        method: "POST",
      }),
    }),
    updateName: builder.mutation({
      query: (name) => ({
        url: "/name",
        method: "PATCH",
        body: { name },
      }),
    }),
    updateEmail: builder.mutation({
      query: (email) => ({
        url: "/email",
        method: "PATCH",
        body: { email },
      }),
    }),
    updatePassword: builder.mutation({
      query: ({ currentPassword, newPassword }) => ({
        url: "/password",
        method: "PATCH",
        body: { currentPassword, newPassword },
      }),
    }),
    blockUser: builder.mutation({
      query: ({ blockedId, conversationId }) => ({
        url: "block",
        method: "POST",
        body: { blockedId, conversationId },
      }),
      invalidatesTags: ["Block"],
    }),
    unblockUser: builder.mutation({
      query: ({ userId, conversationId }) => ({
        url: `block/${userId}`,
        method: "DELETE",
        body: { conversationId },
      }),
    }),
    invalidatesTags: ["Unblock"],
  }),
});

export const {
  useGetUserProfileQuery,
  useGetUserInfoQuery,
  useUpdateUserProfileMutation,
  useUpdateThemeIndexMutation,
  useGetThemeIndexQuery,
  useSearchUserQuery,
  useLoginMutation,
  useRegisterMutation,
  useLogoutMutation,
  useUpdateNameMutation,
  useUpdateEmailMutation,
  useUpdatePasswordMutation,
  useBlockUserMutation,
  useUnblockUserMutation,
} = userApi;
