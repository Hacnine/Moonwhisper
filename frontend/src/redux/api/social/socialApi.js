import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { BASE_URL } from "@/utils/baseUrls";

export const socialApi = createApi({
  reducerPath: "socialApi",
  baseQuery: fetchBaseQuery({
    baseUrl: `${BASE_URL}social`,
    credentials: "include",
  }),
  tagTypes: ["Posts", "Post"],
  endpoints: (builder) => ({
    // GET /social/posts?page=1&limit=10
    getPosts: builder.query({
      query: ({ page = 1, limit = 10 }) => ({
        url: `/posts?page=${page}&limit=${limit}`,
        method: "GET",
      }),
      providesTags: (result) =>
        result?.posts
          ? [
              ...result.posts.map(({ id }) => ({ type: "Post", id: id })),
              { type: "Posts", id: "LIST" },
            ]
          : [{ type: "Posts", id: "LIST" }],
    }),

    // POST /social/posts
    createPost: builder.mutation({
      query: (data) => ({
        url: `/posts`,
        method: "POST",
        body: data,
      }),
      invalidatesTags: [{ type: "Posts", id: "LIST" }],
    }),

    // PUT /social/posts/:postId
    updatePost: builder.mutation({
      query: ({ postId, data }) => ({
        url: `/posts/${postId}`,
        method: "PUT",
        body: data,
      }),
      invalidatesTags: (result, error, { postId }) => [
        { type: "Post", id: postId },
        { type: "Posts", id: "LIST" },
      ],
    }),

    // DELETE /social/posts/:postId
    deletePost: builder.mutation({
      query: (postId) => ({
        url: `/posts/${postId}`,
        method: "DELETE",
      }),
      invalidatesTags: (result, error, postId) => [
        { type: "Post", id: postId },
        { type: "Posts", id: "LIST" },
      ],
    }),

    // POST /social/posts/:postId/reaction
    addReaction: builder.mutation({
      query: ({ postId, data }) => ({
        url: `/posts/${postId}/reaction`,
        method: "POST",
        body: data,
      }),
      invalidatesTags: (result, error, { postId }) => [
        { type: "Post", id: postId },
        { type: "Posts", id: "LIST" },
      ],
    }),

    // POST /social/posts/:postId/comments
    addComment: builder.mutation({
      query: ({ postId, data }) => ({
        url: `/posts/${postId}/comments`,
        method: "POST",
        body: data,
      }),
      invalidatesTags: (result, error, { postId }) => [
        { type: "Post", id: postId },
        { type: "Posts", id: "LIST" },
      ],
    }),

    // POST /social/posts/:postId/comments/:commentId/replies
    addReply: builder.mutation({
      query: ({ postId, commentId, data }) => ({
        url: `/posts/${postId}/comments/${commentId}/replies`,
        method: "POST",
        body: data,
      }),
      invalidatesTags: (result, error, { postId }) => [
        { type: "Post", id: postId },
        { type: "Posts", id: "LIST" },
      ],
    }),
  }),
});

export const {
  useGetPostsQuery,
  useCreatePostMutation,
  useUpdatePostMutation,
  useDeletePostMutation,
  useAddReactionMutation,
  useAddCommentMutation,
  useAddReplyMutation,
} = socialApi;