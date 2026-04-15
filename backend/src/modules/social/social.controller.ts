import { Request, Response } from 'express';
import prisma from '../../config/database.js';

// Transform reactions array into { [type]: count } format (matches old MongoDB schema)
function formatPostForFrontend(post: any): any {
  if (!post) return post;
  const formatted = { ...post };
  if (Array.isArray(post.reactions)) {
    const counts: Record<string, number> = {};
    for (const r of post.reactions) {
      counts[r.type] = (counts[r.type] || 0) + 1;
    }
    formatted.reactions = counts;
  }
  return formatted;
}

// POST /posts — create a new post
export const createPost = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const { content } = req.body;

    if (!content) {
      res.status(400).json({ message: 'Content is required' });
      return;
    }

    const post = await prisma.post.create({
      data: { userId, content },
      include: { user: { select: { id: true, name: true } } },
    });

    const io = (req as any).io;
    if (io) io.emit('newPost', post);

    res.status(201).json(post);
  } catch (error: any) {
    console.error('createPost error:', error);
    res.status(500).json({ message: 'Failed to create post', error: error.message });
  }
};

// PUT /posts/:postId — edit a post
export const editPost = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const postId = req.params.postId as string;
    const { content } = req.body;

    const post = await prisma.post.findUnique({ where: { id: postId } });

    if (!post) {
      res.status(404).json({ message: 'Post not found' });
      return;
    }

    if (post.userId !== userId) {
      res.status(403).json({ message: 'You can only edit your own posts' });
      return;
    }

    const updated = await prisma.post.update({
      where: { id: postId },
      data: { content },
      include: { user: { select: { id: true, name: true } } },
    });

    const io = (req as any).io;
    if (io) io.emit('postUpdated', updated);

    res.status(200).json(updated);
  } catch (error: any) {
    console.error('editPost error:', error);
    res.status(500).json({ message: 'Failed to edit post', error: error.message });
  }
};

// DELETE /posts/:postId — delete a post
export const deletePost = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const postId = req.params.postId as string;

    const post = await prisma.post.findUnique({ where: { id: postId } });

    if (!post) {
      res.status(404).json({ message: 'Post not found' });
      return;
    }

    if (post.userId !== userId) {
      res.status(403).json({ message: 'You can only delete your own posts' });
      return;
    }

    await prisma.post.delete({ where: { id: postId } });

    const io = (req as any).io;
    if (io) io.emit('postDeleted', postId);

    res.status(200).json({ message: 'Post deleted' });
  } catch (error: any) {
    console.error('deletePost error:', error);
    res.status(500).json({ message: 'Failed to delete post', error: error.message });
  }
};

// POST /posts/:postId/reaction — add a reaction to a post
export const addReaction = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const postId = req.params.postId as string;
    const { type } = req.body;

    if (!type) {
      res.status(400).json({ message: 'Reaction type is required' });
      return;
    }

    await prisma.postReaction.upsert({
      where: { postId_userId_type: { postId, userId, type } },
      update: {},
      create: { postId, userId, type },
    });

    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        user: { select: { id: true, name: true } },
        reactions: true,
      },
    });

    const io = (req as any).io;
    if (io) io.emit('postUpdated', post ? formatPostForFrontend(post) : post);

    res.status(200).json(post ? formatPostForFrontend(post) : post);
  } catch (error: any) {
    console.error('addReaction error:', error);
    res.status(500).json({ message: 'Failed to add reaction', error: error.message });
  }
};

// POST /posts/:postId/comments — add a comment to a post
export const addComment = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const postId = req.params.postId as string;
    const { text } = req.body;

    if (!text) {
      res.status(400).json({ message: 'Comment text is required' });
      return;
    }

    await prisma.postComment.create({
      data: { postId, userId, text },
    });

    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        user: { select: { id: true, name: true } },
        comments: {
          include: {
            user: { select: { id: true, name: true } },
            replies: {
              include: { user: { select: { id: true, name: true } } },
            },
          },
        },
      },
    });

    const io = (req as any).io;
    if (io) io.emit('postUpdated', post);

    res.status(201).json(post);
  } catch (error: any) {
    console.error('addComment error:', error);
    res.status(500).json({ message: 'Failed to add comment', error: error.message });
  }
};

// POST /posts/:postId/comments/:commentId/replies — add a reply to a comment
export const addReply = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const commentId = req.params.commentId as string;
    const { text } = req.body;

    if (!text) {
      res.status(400).json({ message: 'Reply text is required' });
      return;
    }

    const comment = await prisma.postComment.findUnique({ where: { id: commentId } });

    if (!comment) {
      res.status(404).json({ message: 'Comment not found' });
      return;
    }

    const reply = await prisma.postCommentReply.create({
      data: { commentId, userId, text },
      include: { user: { select: { id: true, name: true } } },
    });

    // Return full post with all comments & replies (matches old code)
    const post = await prisma.post.findUnique({
      where: { id: comment.postId },
      include: {
        user: { select: { id: true, name: true } },
        comments: {
          include: {
            user: { select: { id: true, name: true } },
            replies: {
              include: { user: { select: { id: true, name: true } } },
            },
          },
        },
      },
    });

    const io = (req as any).io;
    if (io) io.emit('postUpdated', post);

    res.status(201).json(post);
  } catch (error: any) {
    console.error('addReply error:', error);
    res.status(500).json({ message: 'Failed to add reply', error: error.message });
  }
};

// GET /posts — get paginated posts from friends
export const getPosts = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    // Get the user's friend list
    const friendList = await prisma.friendList.findUnique({
      where: { userId },
      include: { friends: true },
    });

    const friendIds = friendList
      ? friendList.friends.map((entry: any) => entry.friendId)
      : [];

    // Include the user's own ID so they see their own posts too
    const userIds = [...friendIds, userId];

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where: { userId: { in: userIds } },
        include: {
          user: { select: { id: true, name: true } },
          reactions: true,
          comments: {
            include: {
              user: { select: { id: true, name: true } },
              replies: {
                include: { user: { select: { id: true, name: true } } },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.post.count({ where: { userId: { in: userIds } } }),
    ]);

    res.status(200).json({
      posts: posts.map(formatPostForFrontend),
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalPosts: total,
        limit,
      },
    });
  } catch (error: any) {
    console.error('getPosts error:', error);
    res.status(500).json({ message: 'Failed to fetch posts', error: error.message });
  }
};
