<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import PageShell from '$lib/components/PageShell.svelte';
  import Avatar from '$lib/components/common/Avatar.svelte';
  import { session } from '$lib/stores/session';
  import { fetchModerationQueue, submitModerationDecision } from '$lib/api/moderation';
  import { pb } from '$lib/api/pb';
  import { defaultAvatar } from '$lib/data/characters';
  import type { ModerationQueueItem } from '$lib/types';

  let items: ModerationQueueItem[] = [];
  let loading = true;
  let error = '';
  let actionError = '';
  let actioningId: string | null = null;
  let roleChecked = false;
  let reasonById: Record<string, string> = {};
  let previewUrl: string | null = null;

  let filterType: 'all' | 'post' | 'comment' = 'all';
  let filterStatus: 'pending_review' | 'hidden' | 'rejected' | 'all' = 'pending_review';
  let filterReviewRequested: 'all' | 'true' | 'false' = 'all';
  let filterSource: 'all' | 'review' | 'reported' = 'all';

  const refreshRole = async () => {
    if (!browser) return;
    if (!pb.authStore.isValid) {
      roleChecked = true;
      return;
    }
    try {
      await pb.collection('users').authRefresh();
    } catch (err) {
      console.error('moderation_auth_refresh_failed', err);
    } finally {
      roleChecked = true;
    }
  };

  $: if (browser && roleChecked && !$session) {
    goto('/login');
  }

  const canModerate = () => {
    const role = ($session?.role ?? 'user') as string;
    return role === 'moderator' || role === 'admin';
  };

  $: if (browser && roleChecked && $session && !canModerate()) {
    goto('/');
  }

  const loadQueue = async () => {
    if (!$session || !canModerate()) return;
    loading = true;
    error = '';
    try {
      const data = await fetchModerationQueue({
        type: filterType,
        status: filterStatus,
        reviewRequested: filterReviewRequested,
        source: filterSource,
        limit: 60,
      });
      items = data.items;
    } catch (err) {
      error = err instanceof Error ? err.message : '加载失败';
    } finally {
      loading = false;
    }
  };

  const updateFilters = () => {
    void loadQueue();
  };

  const setReason = (id: string, value: string) => {
    reasonById = { ...reasonById, [id]: value };
  };

  const submitDecision = async (
    item: ModerationQueueItem,
    decision: 'approve' | 'reject' | 'hide',
  ) => {
    actionError = '';
    const reason = (reasonById[item.id] ?? '').trim();

    actioningId = item.id;
    try {
      await submitModerationDecision({
        targetType: item.targetType,
        targetId: item.id,
        decision,
        reason: reason || undefined,
      });
      reasonById = { ...reasonById, [item.id]: '' };
      await loadQueue();
    } catch (err) {
      const message = err instanceof Error ? err.message : '操作失败';
      switch (message) {
        case 'forbidden':
          actionError = '没有审核权限。';
          break;
        default:
          actionError = message || '操作失败';
      }
    } finally {
      actioningId = null;
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'pending_review':
        return '待复查';
      case 'pending_ai':
        return 'AI审核中';
      case 'rejected':
        return '未通过';
      case 'hidden':
        return '已隐藏';
      default:
        return '已发布';
    }
  };

  onMount(() => {
    void (async () => {
      await refreshRole();
      await loadQueue();
    })();
  });
</script>

<PageShell>
  <div class="moderation">
    <div class="header">
      <div>
        <h1>审核中心</h1>
        <p>待人工处理的内容会在这里出现。</p>
      </div>
      <div class="filters">
        <label>
          队列
          <select bind:value={filterSource} on:change={updateFilters}>
            <option value="all">全部</option>
            <option value="review">复查</option>
            <option value="reported">举报</option>
          </select>
        </label>
        <label>
          类型
          <select bind:value={filterType} on:change={updateFilters}>
            <option value="all">全部</option>
            <option value="post">帖子</option>
            <option value="comment">评论</option>
          </select>
        </label>
        <label>
          状态
          <select bind:value={filterStatus} on:change={updateFilters}>
            <option value="pending_review">待复查</option>
            <option value="hidden">已隐藏</option>
            <option value="rejected">未通过</option>
            <option value="all">全部</option>
          </select>
        </label>
        <label>
          复查申请
          <select bind:value={filterReviewRequested} on:change={updateFilters}>
            <option value="all">全部</option>
            <option value="true">已申请</option>
            <option value="false">未申请</option>
          </select>
        </label>
      </div>
    </div>

    {#if actionError}
      <div class="error">{actionError}</div>
    {/if}
    {#if error}
      <div class="error">{error}</div>
    {/if}

    {#if loading}
      <div class="placeholder">加载中...</div>
    {:else if items.length === 0}
      <div class="placeholder">暂无待审内容</div>
    {:else}
      <div class="queue">
        {#each items as item (item.targetType + item.id)}
          <article class="card">
            <div class="card-main">
              <div class="meta">
                <div class="author">
                  <Avatar src={item.author.avatarUrl ?? defaultAvatar} size={44} />
                  <div>
                    <div class="author-name">{item.author.name}</div>
                    <div class="author-meta">
                      <span class="badge">{item.targetType === 'post' ? '帖子' : '评论'}</span>
                      {#if item.reviewRequested}
                        <span class="badge review">复查申请</span>
                      {/if}
                      <span class="time">{item.createdAt}</span>
                    </div>
                  </div>
                </div>
                <div class="status">
                  <span class="pill">{statusLabel(item.moderationStatus)}</span>
                  <span class="reports">举报 {item.reportCount}</span>
                </div>
              </div>

              {#if item.title}
                <div class="title">{item.title}</div>
              {/if}
              {#if item.postTitle}
                <div class="post-ref">来自帖子：{item.postTitle}</div>
              {/if}
              <div class="body">{item.body}</div>

              {#if item.aiReason || item.reviewRequested || item.moderationStatus === 'rejected'}
                <div class="ai-reason">
                  <div class="ai-label">AI 驳回原因</div>
                  <div class="ai-text">{item.aiReason || '暂无记录'}</div>
                </div>
              {/if}

              {#if item.reportCount > 0}
                <div class="report-list">
                  <div class="report-title">举报记录（{item.reportCount}）</div>
                  <div class="report-items">
                    {#each item.reports ?? [] as report}
                      <div class="report-item">
                        <div class="report-reason">{report.reason}</div>
                        {#if report.detail}
                          <div class="report-detail">{report.detail}</div>
                        {/if}
                        <div class="report-time">{report.createdAt}</div>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}

              <div class="reason">
                <label>
                  人工驳回原因（选填）
                  <textarea
                    rows="2"
                    placeholder="请输入驳回原因"
                    value={reasonById[item.id] ?? ''}
                    on:input={(event) =>
                      setReason(item.id, (event.target as HTMLTextAreaElement).value)}
                  ></textarea>
                </label>
              </div>

              <div class="actions">
                <button
                  class="approve"
                  type="button"
                  disabled={actioningId === item.id}
                  on:click={() => submitDecision(item, 'approve')}
                >
                  通过
                </button>
                <button
                  class="reject"
                  type="button"
                  disabled={actioningId === item.id}
                  on:click={() => submitDecision(item, 'reject')}
                >
                  驳回
                </button>
                <button
                  class="hide"
                  type="button"
                  disabled={actioningId === item.id}
                  on:click={() => submitDecision(item, 'hide')}
                >
                  隐藏
                </button>
              </div>
            </div>
            {#if item.coverUrl}
              <button class="cover" type="button" on:click={() => (previewUrl = item.coverUrl ?? null)}>
                <img src={item.coverUrl} alt="" />
              </button>
            {/if}
          </article>
        {/each}
      </div>
    {/if}
  </div>
</PageShell>

{#if previewUrl}
  <div class="preview" on:click={() => (previewUrl = null)}>
    <img src={previewUrl} alt="" />
  </div>
{/if}

<style>
  .moderation {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 100%;
    height: 100%;
  }

  .header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }

  h1 {
    margin: 0;
    font-size: 24px;
  }

  p {
    margin: 6px 0 0;
    color: #6b6b6b;
    font-size: 14px;
  }

  .filters {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 12px;
    color: #b5b5b5;
  }

  select,
  textarea {
    background: #101010;
    border: 2px solid #2a2a2a;
    border-radius: 12px;
    color: #fff;
    padding: 8px 10px;
    font-size: 13px;
  }

  textarea {
    resize: vertical;
    min-height: 68px;
  }

  .queue {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .card {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 16px;
    padding: 18px;
    border-radius: 18px;
    border: 2px solid #1f1f1f;
    background: #0b0b0b;
  }

  .card-main {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .author {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .author-name {
    color: #fff;
    font-size: 16px;
  }

  .author-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 4px;
    color: #666;
    font-size: 12px;
  }

  .badge {
    padding: 2px 8px;
    border-radius: 999px;
    background: #1d1d1d;
    color: #d3d3d3;
  }

  .badge.review {
    background: rgba(163, 193, 1, 0.2);
    color: #a3c101;
  }

  .status {
    display: flex;
    gap: 10px;
    align-items: center;
    color: #888;
    font-size: 12px;
  }

  .pill {
    padding: 4px 10px;
    border-radius: 999px;
    background: #202020;
    color: #d6d6d6;
  }

  .reports {
    color: #8c8c8c;
  }

  .title {
    font-size: 18px;
    color: #fff;
  }

  .post-ref {
    color: #7a7a7a;
    font-size: 13px;
  }

  .body {
    color: #c7c7c7;
    line-height: 1.6;
    white-space: pre-line;
  }

  .ai-reason {
    border-radius: 12px;
    border: 1px solid rgba(163, 193, 1, 0.3);
    padding: 10px 12px;
    background: rgba(163, 193, 1, 0.08);
  }

  .ai-label {
    color: #a3c101;
    font-size: 12px;
  }

  .ai-text {
    margin-top: 6px;
    color: #d6d6d6;
    font-size: 13px;
  }

  .report-list {
    border-radius: 12px;
    border: 1px solid rgba(124, 124, 124, 0.4);
    padding: 10px 12px;
    background: rgba(255, 255, 255, 0.03);
  }

  .report-title {
    color: #c9c9c9;
    font-size: 12px;
  }

  .report-items {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 8px;
  }

  .report-item {
    border-radius: 10px;
    padding: 8px 10px;
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(255, 255, 255, 0.06);
  }

  .report-reason {
    color: #f0c36b;
    font-size: 13px;
  }

  .report-detail {
    color: #bdbdbd;
    margin-top: 4px;
    font-size: 12px;
  }

  .report-time {
    color: #6d6d6d;
    margin-top: 4px;
    font-size: 11px;
  }

  .reason {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  .actions button {
    border: none;
    border-radius: 12px;
    padding: 8px 14px;
    cursor: pointer;
    color: #fff;
    background: #1f1f1f;
  }

  .actions button.approve {
    background: #a3c101;
    color: #000;
  }

  .actions button.reject {
    background: #c23a2b;
  }

  .actions button.hide {
    background: #2d2d2d;
  }

  .actions button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .cover {
    padding: 0;
    cursor: zoom-in;
    width: 200px;
    align-self: stretch;
    border-radius: 14px;
    overflow: hidden;
    border: 2px solid #1d1d1d;
    background: #101010;
  }

  .cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .preview {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.75);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 30;
    cursor: zoom-out;
  }

  .preview img {
    max-width: min(90vw, 960px);
    max-height: 90vh;
    border-radius: 16px;
    border: 2px solid #1f1f1f;
    object-fit: contain;
    background: #0b0b0b;
  }

  .placeholder {
    color: #666;
    text-align: center;
    padding: 40px 0;
  }

  .error {
    color: #ff7b7b;
    font-size: 14px;
  }

  @media (max-width: 920px) {
    .card {
      grid-template-columns: 1fr;
    }

    .cover {
      width: 100%;
      max-height: 240px;
    }
  }
</style>
