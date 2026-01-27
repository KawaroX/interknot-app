import type PocketBase from 'pocketbase';

export const createSystemMessage = async (payload: {
  admin: PocketBase;
  userId: string;
  title: string;
  body?: string;
  messageType?: 'system' | 'like' | 'comment';
  actorId?: string;
  targetType?: 'post' | 'comment';
  postId?: string;
  commentId?: string;
}) => {
  const { admin, userId, title, body, messageType, actorId, targetType, postId, commentId } =
    payload;

  await admin.collection('system_messages').create({
    user: userId,
    message_type: messageType ?? 'system',
    actor: actorId ?? null,
    title,
    body: body ?? '',
    target_type: targetType ?? null,
    post: postId ?? null,
    comment: commentId ?? null,
    status: 'unread',
  });
};
