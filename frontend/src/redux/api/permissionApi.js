import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { BASE_URL } from "@/utils/baseUrls";

export const permissionApi = createApi({
  reducerPath: "permissionApi",
  baseQuery: fetchBaseQuery({
    baseUrl: `${BASE_URL}permissions`,
    credentials: "include",
  }),
  tagTypes: ["MessagePermissions"],
  endpoints: (builder) => ({
    getMessagePermissions: builder.query({
      query: (conversationId) => `/conversations/${conversationId}`,
      providesTags: ["MessagePermissions"],
    }),

    requestPermission: builder.mutation({
      query: ({ conversationId, permissionType, reason }) => ({
        url: `/conversations/${conversationId}/request`,
        method: "POST",
        body: { permissionType, reason },
      }),
      invalidatesTags: ["MessagePermissions"],
    }),
  }),
});

export const {
  useGetMessagePermissionsQuery,
  useRequestPermissionMutation,
} = permissionApi;
