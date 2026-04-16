import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { BASE_URL } from "../../utils/baseUrls";

export const lessonApi = createApi({
  reducerPath: "lessonApi",
  baseQuery: fetchBaseQuery({
    baseUrl: BASE_URL,
    credentials: "include",
  }),
  tagTypes: ["QuickLesson"],
  endpoints: (builder) => ({
    fetchQuickLessons: builder.query({
      query: (conversationId) => ({
        url: "quick-lessons",
        params: { conversationId }, // Send conversationId as a query parameter
      }),
      invalidatesTags: ["QuickLesson"],
    }),
    addQuickLesson: builder.mutation({
      query: (lesson) => ({
        url: "quick-lessons",
        method: "POST",
        body: lesson,
      }),
      invalidatesTags: ["QuickLesson"],
    }),
    editQuickLesson: builder.mutation({
      query: ({ id, ...update }) => ({
        url: `quick-lessons/${id}`,
        method: "PUT",
        body: update,
      }),
      invalidatesTags: ["QuickLesson"],
    }),
    deleteQuickLesson: builder.mutation({
      query: (id) => ({
        url: `quick-lessons/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: ["QuickLesson"],
    }),
  }),
});

export const {
  useFetchQuickLessonsQuery,
  useAddQuickLessonMutation,
  useEditQuickLessonMutation,
  useDeleteQuickLessonMutation,
} = lessonApi;
