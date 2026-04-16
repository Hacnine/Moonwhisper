import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { BASE_URL } from "@/utils/baseUrls";

export const reminderApi = createApi({
  reducerPath: "reminderApi",
  baseQuery: fetchBaseQuery({
    baseUrl: `${BASE_URL}reminders`,
    credentials: "include", // Send cookies with requests
    prepareHeaders: (headers) => {
      return headers;
    },
  }),
  tagTypes: ["Reminder"],
  endpoints: (builder) => ({
    // Create a new reminder
    createReminder: builder.mutation({
      query: (reminderData) => ({
        url: "/",
        method: "POST",
        body: reminderData,
      }),
      invalidatesTags: ["Reminder"],
    }),

    // Get reminders for a specific conversation
    getConversationReminders: builder.query({
      query: (conversationId) => `/conversation/${conversationId}`,
      providesTags: (result, error, conversationId) => [
        { type: "Reminder", id: `conversation-${conversationId}` },
      ],
    }),

    // Get all reminders for the logged-in user
    getUserReminders: builder.query({
      query: (includeNotified = false) => ({
        url: "/user",
        params: { includeNotified: includeNotified ? "true" : "false" },
      }),
      providesTags: ["Reminder"],
    }),

    // Get upcoming reminders (next 24 hours)
    getUpcomingReminders: builder.query({
      query: () => "/upcoming",
      providesTags: ["Reminder"],
    }),

    // Get missed reminders
    getMissedReminders: builder.query({
      query: () => "/missed",
      providesTags: ["Reminder"],
    }),

    // Get a single reminder by ID
    getReminderById: builder.query({
      query: (id) => `/${id}`,
      providesTags: (result, error, id) => [{ type: "Reminder", id }],
    }),

    // Update a reminder
    updateReminder: builder.mutation({
      query: ({ id, ...updates }) => ({
        url: `/${id}`,
        method: "PATCH",
        body: updates,
      }),
      invalidatesTags: (result, error, { id }) => [
        { type: "Reminder", id },
        "Reminder",
      ],
    }),

    // Delete a reminder
    deleteReminder: builder.mutation({
      query: (id) => ({
        url: `/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Reminder"],
    }),

    // Mark reminder as notified
    markReminderNotified: builder.mutation({
      query: (id) => ({
        url: `/${id}/notify`,
        method: "POST",
      }),
      invalidatesTags: (result, error, id) => [
        { type: "Reminder", id },
        "Reminder",
      ],
    }),

    // Toggle reminder enabled/disabled
    toggleReminder: builder.mutation({
      query: ({ id, enabled }) => ({
        url: `/${id}/toggle`,
        method: "PATCH",
        body: { enabled },
      }),
      invalidatesTags: (result, error, { id }) => [
        { type: "Reminder", id },
        "Reminder",
      ],
    }),
  }),
});

export const {
  useCreateReminderMutation,
  useGetConversationRemindersQuery,
  useGetUserRemindersQuery,
  useGetUpcomingRemindersQuery,
  useGetMissedRemindersQuery,
  useGetReminderByIdQuery,
  useUpdateReminderMutation,
  useDeleteReminderMutation,
  useMarkReminderNotifiedMutation,
  useToggleReminderMutation,
} = reminderApi;

export default reminderApi;
