import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { BASE_URL } from "@/utils/baseUrls";

export const formApi = createApi({
  reducerPath: "formApi",
  baseQuery: fetchBaseQuery({
    baseUrl: `${BASE_URL}forms`,
    credentials: "include",
  }),
  tagTypes: ["Forms", "FormAssignments", "FormSubmissions", "CalendarStatus"],
  endpoints: (builder) => ({
    // ─── Form CRUD ───

    createForm: builder.mutation({
      query: (body) => ({ url: "/", method: "POST", body }),
      invalidatesTags: ["Forms"],
    }),

    getMyForms: builder.query({
      query: () => "/my",
      providesTags: ["Forms"],
    }),

    searchPublicForms: builder.query({
      query: (q) => `/public${q ? `?name=${encodeURIComponent(q)}` : ""}`,
      providesTags: ["Forms"],
    }),

    getFormById: builder.query({
      query: (formId) => `/${formId}`,
      providesTags: (result, error, formId) => [{ type: "Forms", id: formId }],
    }),

    updateForm: builder.mutation({
      query: ({ formId, ...body }) => ({
        url: `/${formId}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["Forms"],
    }),

    archiveForm: builder.mutation({
      query: (formId) => ({ url: `/${formId}`, method: "DELETE" }),
      invalidatesTags: ["Forms", "FormAssignments"],
    }),

    // ─── Assignments ───

    assignForm: builder.mutation({
      query: (body) => ({ url: "/assignments", method: "POST", body }),
      invalidatesTags: ["FormAssignments"],
    }),

    getMyAssignments: builder.query({
      query: () => "/assignments/my",
      providesTags: ["FormAssignments"],
    }),

    getAssignmentsByConversation: builder.query({
      query: (conversationId) =>
        `/assignments/conversation/${conversationId}`,
      providesTags: ["FormAssignments"],
    }),

    deactivateAssignment: builder.mutation({
      query: (assignmentId) => ({
        url: `/assignments/${assignmentId}/deactivate`,
        method: "PATCH",
      }),
      invalidatesTags: ["FormAssignments"],
    }),

    // ─── Submissions ───

    submitForm: builder.mutation({
      query: ({ assignmentId, ...body }) => ({
        url: `/assignments/${assignmentId}/submit`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["FormSubmissions", "CalendarStatus"],
    }),

    getSubmissions: builder.query({
      query: ({ assignmentId, startDate, endDate, submitterId }) => {
        const params = new URLSearchParams();
        if (startDate) params.append("startDate", startDate);
        if (endDate) params.append("endDate", endDate);
        if (submitterId) params.append("submitterId", submitterId);
        return `/assignments/${assignmentId}/submissions?${params.toString()}`;
      },
      providesTags: ["FormSubmissions"],
    }),

    getSubmissionById: builder.query({
      query: (submissionId) => `/submissions/${submissionId}`,
      providesTags: (result, error, id) => [{ type: "FormSubmissions", id }],
    }),

    // ─── Review ───

    reviewSubmission: builder.mutation({
      query: ({ submissionId, reviews }) => ({
        url: `/submissions/${submissionId}/review`,
        method: "PATCH",
        body: { reviews },
      }),
      invalidatesTags: ["FormSubmissions", "CalendarStatus"],
    }),

    // ─── Calendar ───

    getCalendarStatus: builder.query({
      query: ({ assignmentId, startDate, endDate, submitterId }) => {
        const params = new URLSearchParams({ startDate, endDate });
        if (submitterId) params.append("submitterId", submitterId);
        return `/assignments/${assignmentId}/calendar?${params.toString()}`;
      },
      providesTags: ["CalendarStatus"],
    }),
  }),
});

export const {
  // Forms
  useCreateFormMutation,
  useGetMyFormsQuery,
  useSearchPublicFormsQuery,
  useGetFormByIdQuery,
  useUpdateFormMutation,
  useArchiveFormMutation,
  // Assignments
  useAssignFormMutation,
  useGetMyAssignmentsQuery,
  useGetAssignmentsByConversationQuery,
  useDeactivateAssignmentMutation,
  // Submissions
  useSubmitFormMutation,
  useGetSubmissionsQuery,
  useGetSubmissionByIdQuery,
  // Review
  useReviewSubmissionMutation,
  // Calendar
  useGetCalendarStatusQuery,
} = formApi;
