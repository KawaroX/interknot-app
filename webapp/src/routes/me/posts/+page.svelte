<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import { session } from '$lib/stores/session';
  import { loadMyPosts, myPosts, myPostsLoading } from '$lib/stores/myPosts';
  import { openCompose, openMessage } from '$lib/stores/popup';
  import PopupLayer from '$lib/components/PopupLayer.svelte';
  import type { PostSummary } from '$lib/types';

  $: if (browser && !$session) {
    goto('/login');
  }

  onMount(() => {
    void loadMyPosts();
  });

  const statusLabel = (status: string) => {
    switch (status) {
      case 'pending_ai':
        return '审核中';
      case 'pending_review':
        return '复查中';
      case 'rejected':
        return '未通过';
      case 'hidden':
        return '已隐藏';
      default:
        return '已发布';
    }
  };

  const formatDate = (value: string) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('zh-CN', { hour12: false });
  };

  const getPostTime = (post: PostSummary) => {
    const createdAt = post.createdAt;
    const editedAt = post.editedAt;
    const createdTime = new Date(createdAt).getTime();
    const editedTime = editedAt ? new Date(editedAt).getTime() : Number.NaN;
    const isEdited =
      Boolean(editedAt) &&
      !Number.isNaN(editedTime) &&
      Math.abs(editedTime - createdTime) > 1000;
    return {
      label: isEdited ? '编辑时间' : '发布时间',
      value: isEdited && editedAt ? editedAt : createdAt,
    };
  };
</script>

<div class="my-posts">
  <div class="panel">
    <div class="header">
      <h1>我的发布</h1>
      <button class="back" type="button" on:click={() => goto('/me')}>返回</button>
    </div>
    {#if $myPostsLoading}
      <div class="placeholder">加载中...</div>
    {:else if $myPosts.length === 0}
      <div class="placeholder">暂无内容</div>
    {:else}
      <div class="list">
        {#each $myPosts as post}
          {@const time = getPostTime(post)}
          <div class="item">
            <button
              class="item-main"
              type="button"
              on:click={() => openMessage(post.id)}
            >
              <div class="title">{post.title}</div>
              <div class="meta">
                <span>{statusLabel(post.moderationStatus)}</span>
                <span>{time.label}：{formatDate(time.value)}</span>
              </div>
            </button>
            <div class="item-actions">
              <button
                class="edit"
                type="button"
                on:click={() => openCompose(post)}
              >
                编辑
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
<PopupLayer />

<style>
  .my-posts {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px 16px;
    background: radial-gradient(circle at top, #121212 0%, #020202 60%);
  }

  .panel {
    width: min(720px, 100%);
    background: #0b0b0b;
    border: 2px solid #1f1f1f;
    border-radius: 18px;
    padding: 28px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  h1 {
    margin: 0;
    font-size: 24px;
  }

  .back {
    border: 2px solid #2a2a2a;
    border-radius: 999px;
    padding: 6px 16px;
    background: #0f0f0f;
    color: #b5b5b5;
    cursor: pointer;
  }

  .back:hover {
    background: #a3c101;
    color: #000;
    border-color: #a3c101;
  }

  .placeholder {
    color: #666;
    text-align: center;
    padding: 30px 0;
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border: 2px solid #1b1b1b;
    border-radius: 14px;
    padding: 12px;
    background: #0f0f0f;
    color: #fff;
  }

  .item:hover {
    border-color: #a3c101;
  }

  .item-main {
    flex: 1;
    border: none;
    padding: 0;
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }

  .item-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .edit {
    border: 1px solid #2a2a2a;
    border-radius: 999px;
    padding: 6px 12px;
    background: transparent;
    color: #b5b5b5;
    cursor: pointer;
    font-size: 12px;
  }

  .edit:hover {
    border-color: #a3c101;
    color: #a3c101;
  }

  .title {
    font-size: 16px;
    margin-bottom: 6px;
  }

  .meta {
    display: flex;
    justify-content: space-between;
    color: #888;
    font-size: 12px;
  }
</style>
