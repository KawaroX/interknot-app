<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import PageShell from '$lib/components/PageShell.svelte';
  import { session } from '$lib/stores/session';
  import { loadMessages, messages, messagesLoading } from '$lib/stores/messages';
  import { updateMessageStatus } from '$lib/api/messages';
  import { requestReview } from '$lib/api/posts';
  import type { SystemMessage } from '$lib/types';

  let tab: 'system' | 'like' | 'comment' = 'system';
  let visibleMessages: SystemMessage[] = [];
  let messagesLoaded = false;
  let lastAutoReadTab: 'like' | 'comment' | null = null;

  $: if (browser && !$session) {
    goto('/login');
  }

  const autoReadTabMessages = async (targetTab: 'like' | 'comment') => {
    const items = get(messages);
    const targets = items.filter(
      (message) => messageType(message) === targetTab && message.status === 'unread',
    );
    if (targets.length === 0) return;
    await Promise.allSettled(
      targets.map((message) => updateMessageStatus(message.id, 'read')),
    );
  };

  onMount(() => {
    void (async () => {
      await loadMessages();
      messagesLoaded = true;
    })();
  });

  const markRead = async (id: string) => {
    await updateMessageStatus(id, 'read');
    messages.update((items) =>
      items.map((item) => (item.id === id ? { ...item, status: 'read' } : item)),
    );
  };

  const hideMessage = async (id: string) => {
    await updateMessageStatus(id, 'hidden');
    messages.update((items) => items.filter((item) => item.id !== id));
  };

  const requestManualReview = async (message: {
    id: string;
    messageType?: string;
    targetType?: string;
    postId?: string | null;
    commentId?: string | null;
  }) => {
    if (message.messageType !== 'system' || !message.targetType) return;
    const targetId = message.targetType === 'post' ? message.postId : message.commentId;
    if (!targetId) return;
    await requestReview({
      targetType: message.targetType as 'post' | 'comment',
      targetId,
      messageId: message.id,
    });
    messages.update((items) =>
      items.map((item) => (item.id === message.id ? { ...item, status: 'actioned' } : item)),
    );
  };

  const messageType = (message: { messageType?: string }) =>
    (message.messageType ?? 'system') as 'system' | 'like' | 'comment';

  const actorLabel = (message: { actor?: { name?: string } }) =>
    message.actor?.name ?? '有人';

  const postLabel = (message: { postTitle?: string }) =>
    message.postTitle ? `《${message.postTitle}》` : '一篇帖子';

  $: if (browser && messagesLoaded && (tab === 'like' || tab === 'comment')) {
    if (lastAutoReadTab !== tab) {
      lastAutoReadTab = tab;
      void autoReadTabMessages(tab);
    }
  }

  $: visibleMessages = $messages.filter((message) => messageType(message) === tab);
</script>

<PageShell>
  <div class="messages">
    <div class="header">
      <h1>消息中心</h1>
      <div class="tabs">
        <button class:active={tab === 'system'} on:click={() => (tab = 'system')}>系统消息</button>
        <button class:active={tab === 'like'} on:click={() => (tab = 'like')}>点赞消息</button>
        <button class:active={tab === 'comment'} on:click={() => (tab = 'comment')}>评论消息</button>
      </div>
    </div>
    {#if $messagesLoading}
      <div class="placeholder">加载中...</div>
    {:else if visibleMessages.length === 0}
      <div class="placeholder">暂无消息</div>
    {:else}
      <div class="list">
        {#each visibleMessages as message}
          <div class="item" class:unread={message.status === 'unread'}>
            <div class="meta">
              <div class="title">
                {#if messageType(message) === 'system'}
                  {message.title}
                {:else if messageType(message) === 'like'}
                  点赞消息
                {:else}
                  评论消息
                {/if}
              </div>
              <div class="time">{message.createdAt}</div>
            </div>
            {#if messageType(message) === 'system'}
              <div class="body">{message.body}</div>
            {:else if messageType(message) === 'like'}
              <div class="body">
                <span class="highlight">{actorLabel(message)}</span>
                点赞了
                <span class="post">{postLabel(message)}</span>
              </div>
            {:else}
              <div class="body">
                <span class="highlight">{actorLabel(message)}</span>
                回复了
                <span class="post">{postLabel(message)}</span>
              </div>
              <div class="comment">{message.commentBody ?? message.body}</div>
            {/if}
            <div class="actions">
              {#if messageType(message) === 'system' && message.status !== 'actioned' && message.targetType}
                <button type="button" on:click={() => requestManualReview(message)}>申请复查</button>
              {/if}
              {#if messageType(message) === 'system' && message.status === 'unread'}
                <button type="button" on:click={() => markRead(message.id)}>已读</button>
              {/if}
              <button type="button" on:click={() => hideMessage(message.id)}>删除</button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</PageShell>

<style>
  .messages {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 100%;
    height: 100%;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  h1 {
    margin: 0;
    font-size: 24px;
  }

  .tabs {
    display: flex;
    gap: 12px;
  }

  .tabs button {
    border: 2px solid #2a2a2a;
    border-radius: 999px;
    padding: 6px 16px;
    background: #111;
    color: #aaa;
    cursor: pointer;
  }

  .tabs button.active {
    background: #a3c101;
    color: #000;
    border-color: #a3c101;
  }

  .placeholder {
    color: #666;
    padding: 30px 0;
    text-align: center;
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow: auto;
  }

  .item {
    border: 2px solid #1b1b1b;
    border-radius: 14px;
    padding: 14px;
    background: #0f0f0f;
  }

  .item.unread {
    border-color: #a3c101;
  }

  .meta {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }

  .title {
    color: #fff;
  }

  .time {
    color: #666;
    font-size: 12px;
  }

  .body {
    color: #b5b5b5;
    margin-top: 6px;
  }

  .comment {
    margin-top: 6px;
    padding: 10px 12px;
    border-radius: 12px;
    background: #121212;
    border: 1px solid #232323;
    color: #d7d7d7;
    font-size: 13px;
    line-height: 1.5;
  }

  .highlight {
    color: #fff;
    font-weight: 600;
  }

  .post {
    color: #a3c101;
  }

  .actions {
    display: flex;
    gap: 8px;
    margin-top: 10px;
  }

  .actions button {
    border: none;
    border-radius: 12px;
    padding: 6px 12px;
    background: #1f1f1f;
    color: #fff;
    cursor: pointer;
  }

  .actions button:hover {
    background: #a3c101;
    color: #000;
  }
</style>
