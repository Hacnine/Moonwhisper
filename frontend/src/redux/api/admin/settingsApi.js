import { BASE_URL } from "@/utils/baseUrls"
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react"

/**
 * Settings API slice for admin settings management
 */
export const settingsApi = createApi({
  reducerPath: "settingsApi",
  baseQuery: fetchBaseQuery({
    baseUrl: `${BASE_URL}admin`,
    credentials: "include",
  }),
  tagTypes: ["AdminSettings"],
  endpoints: (builder) => ({
    // Get Admin Settings
    getAdminSettings: builder.query({
      query: () => "/settings",
      providesTags: ["AdminSettings"],
    }),

    // Update Admin Settings
    updateAdminSettings: builder.mutation({
      query: (settings) => ({
        url: "/settings",
        method: "PUT",
        body: settings,
      }),
      invalidatesTags: ["AdminSettings"],
      // Optimistic update
      async onQueryStarted(patch, { dispatch, queryFulfilled }) {
        const patchResult = dispatch(
          settingsApi.util.updateQueryData("getAdminSettings", undefined, (draft) => {
            Object.assign(draft, patch)
          }),
        )
        try {
          await queryFulfilled
        } catch {
          patchResult.undo()
        }
      },
    }),
  }),
})

export const { useGetAdminSettingsQuery, useUpdateAdminSettingsMutation } = settingsApi
