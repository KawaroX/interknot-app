<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import PageShell from '$lib/components/PageShell.svelte';
  import Avatar from '$lib/components/common/Avatar.svelte';
  import { session } from '$lib/stores/session';
  import { pb } from '$lib/api/pb';
  import { fetchInvites, generateInvites, setInviteEnabled } from '$lib/api/invites';
  import { defaultAvatar } from '$lib/data/characters';
  import type { InviteItem } from '$lib/types';

  let items: InviteItem[] = [];
  let loading = true;
  let error = '';
  let actionError = '';
  let actionMessage = '';
  let statusFilter: 'all' | 'unused' | 'used' | 'disabled' = 'all';
  let roleChecked = false;
  let generating = false;
  let generateCount = 10;
  let generateLength = 12;
  let generatedCodes: string[] = [];
  let updatingId: string | null = null;

  const refreshRole = async () => {
    if (!browser) return;
    if (!pb.authStore.isValid) {
      roleChecked = true;
      return;
    }
    try {
      await pb.collection('users').authRefresh();
    } catch (err) {
      console.error('invite_admin_auth_refresh_failed', err);
    } finally {
      roleChecked = true;
    }
  };

  $: if (browser && roleChecked && !$session) {
    goto('/login');
  }

  const canManage = () => {
    const role = ($session?.role ?? 'user') as string;
    return role === 'admin';
  };

  $: if (browser && roleChecked && $session && !canManage()) {
    goto('/');
  }

  const loadInvites = async () => {
    if (!$session || !canManage()) return;
    loading = true;
    error = '';
    try {
      const data = await fetchInvites({ status: statusFilter, limit: 200 });
      items = data.items;
    } catch (err) {
      error = err instanceof Error ? err.message : '加载失败';
    } finally {
      loading = false;
    }
  };

  const normalizeNumber = (value: number, fallback: number) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.trunc(parsed);
  };

  const createInvites = async () => {
    actionError = '';
    actionMessage = '';
    const count = normalizeNumber(generateCount, 10);
    const length = normalizeNumber(generateLength, 12);
    if (count < 1 || count > 200 || length < 6 || length > 32) {
      actionError = '数量或长度不合法';
      return;
    }
    generating = true;
    try {
      const data = await generateInvites({ count, length });
      generatedCodes = data.codes;
      actionMessage = `已生成 ${data.codes.length} 个邀请码`;
      await loadInvites();
    } catch (err) {
      actionError = err instanceof Error ? err.message : '生成失败';
    } finally {
      generating = false;
    }
  };

  const toggleInvite = async (invite: InviteItem) => {
    actionError = '';
    actionMessage = '';
    updatingId = invite.id;
    try {
      await setInviteEnabled({ id: invite.id, enabled: !invite.enabled });
      items = items.map((item) =>
        item.id === invite.id ? { ...item, enabled: !invite.enabled } : item,
      );
      actionMessage = invite.enabled ? '已禁用邀请码' : '已启用邀请码';
    } catch (err) {
      actionError = err instanceof Error ? err.message : '更新失败';
    } finally {
      updatingId = null;
    }
  };

  const copyText = async (value: string) => {
    if (!browser) return;
    actionError = '';
    actionMessage = '';
    try {
      await navigator.clipboard.writeText(value);
      actionMessage = '已复制到剪贴板';
    } catch (err) {
      actionError = '复制失败';
    }
  };

  const formatDate = (value: string | null | undefined) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('zh-CN', { hour12: false });
  };

  $: totalCount = items.length;
  $: usedCount = items.filter((item) => item.usedBy).length;
  $: disabledCount = items.filter((item) => !item.enabled).length;
  $: availableCount = items.filter((item) => item.enabled && !item.usedBy).length;

  onMount(() => {
    void (async () => {
      await refreshRole();
      await loadInvites();
    })();
  });
</script>

<PageShell>
  <div class="invite-admin">
    <div class="header">
      <div>
        <h1>邀请码管理</h1>
        <p>生成、禁用并查看邀请码使用情况。</p>
      </div>
      <div class="header-actions">
        <label>
          筛选
          <select bind:value={statusFilter} on:change={loadInvites}>
            <option value="all">全部</option>
            <option value="unused">未使用</option>
            <option value="used">已使用</option>
            <option value="disabled">已禁用</option>
          </select>
        </label>
        <button class="ghost" type="button" on:click={loadInvites} disabled={loading}>
          刷新
        </button>
      </div>
    </div>

    {#if actionMessage}
      <div class="success">{actionMessage}</div>
    {/if}
    {#if actionError}
      <div class="error">{actionError}</div>
    {/if}
    {#if error}
      <div class="error">{error}</div>
    {/if}

    <div class="panel-grid">
      <section class="panel">
        <div class="panel-title">批量生成</div>
        <div class="form-row">
          <label>
            数量
            <input type="number" min="1" max="200" bind:value={generateCount} />
          </label>
          <label>
            长度
            <input type="number" min="6" max="32" bind:value={generateLength} />
          </label>
        </div>
        <button class="primary" type="button" on:click={createInvites} disabled={generating}>
          {generating ? '生成中...' : '生成邀请码'}
        </button>
        {#if generatedCodes.length > 0}
          <div class="generated">
            <div class="generated-header">
              <span>新生成 {generatedCodes.length} 个</span>
              <button class="ghost" type="button" on:click={() => copyText(generatedCodes.join('\n'))}>
                复制全部
              </button>
            </div>
            <div class="code-grid">
              {#each generatedCodes as code}
                <div class="code-pill">
                  <span>{code}</span>
                  <button class="copy" type="button" on:click={() => copyText(code)}>复制</button>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </section>

      <section class="panel stats">
        <div class="panel-title">概览</div>
        <div class="stat-grid">
          <div class="stat">
            <span class="label">总数</span>
            <span class="value">{totalCount}</span>
          </div>
          <div class="stat">
            <span class="label">可用</span>
            <span class="value">{availableCount}</span>
          </div>
          <div class="stat">
            <span class="label">已使用</span>
            <span class="value">{usedCount}</span>
          </div>
          <div class="stat">
            <span class="label">已禁用</span>
            <span class="value">{disabledCount}</span>
          </div>
        </div>
      </section>
    </div>

    <section class="panel list">
      <div class="panel-title">邀请码列表</div>
      {#if loading}
        <div class="placeholder">加载中...</div>
      {:else if items.length === 0}
        <div class="placeholder">暂无邀请码</div>
      {:else}
        <div class="list">
          <div class="list-header">
            <span>邀请码</span>
            <span>状态</span>
            <span>使用者</span>
            <span>使用时间</span>
            <span>创建时间</span>
            <span>操作</span>
          </div>
          {#each items as invite (invite.id)}
            <div class="list-row">
              <div class="cell code">
                <span class="cell-label">邀请码</span>
                <span class="code-text">{invite.code}</span>
              </div>
              <div class="cell status">
                <span class="cell-label">状态</span>
                <div class="pill-row">
                  <span class="pill" class:enabled={invite.enabled} class:disabled={!invite.enabled}>
                    {invite.enabled ? '启用' : '禁用'}
                  </span>
                  <span class="pill" class:used={invite.usedBy} class:unused={!invite.usedBy}>
                    {invite.usedBy ? '已使用' : '未使用'}
                  </span>
                </div>
              </div>
              <div class="cell user">
                <span class="cell-label">使用者</span>
                {#if invite.usedBy}
                  <div class="user-chip">
                    <Avatar src={invite.usedBy.avatarUrl ?? defaultAvatar} size={28} />
                    <span>{invite.usedBy.name}</span>
                  </div>
                {:else}
                  <span class="muted">—</span>
                {/if}
              </div>
              <div class="cell time">
                <span class="cell-label">使用时间</span>
                <span>{formatDate(invite.usedAt)}</span>
              </div>
              <div class="cell time">
                <span class="cell-label">创建时间</span>
                <span>{formatDate(invite.createdAt)}</span>
              </div>
              <div class="cell actions">
                <span class="cell-label">操作</span>
                <div class="action-row">
                  <button
                    class="action"
                    data-variant={invite.enabled ? 'disable' : 'enable'}
                    type="button"
                    disabled={updatingId === invite.id}
                    on:click={() => toggleInvite(invite)}
                  >
                    {invite.enabled ? '禁用' : '启用'}
                  </button>
                  <button class="action" data-variant="copy" type="button" on:click={() => copyText(invite.code)}>
                    复制
                  </button>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  </div>
</PageShell>

<style>
  .invite-admin {
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

  .header-actions {
    display: flex;
    align-items: flex-end;
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

  input,
  select {
    background: #101010;
    border: 2px solid #2a2a2a;
    border-radius: 12px;
    color: #fff;
    padding: 8px 10px;
    font-size: 13px;
  }

  .panel-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 16px;
  }

  .panel {
    background: #0b0b0b;
    border: 2px solid #1f1f1f;
    border-radius: 18px;
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .panel-title {
    color: #fff;
    font-size: 16px;
  }

  .form-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 12px;
  }

  .primary {
    border: none;
    border-radius: 12px;
    padding: 10px 14px;
    background: #a3c101;
    color: #000;
    cursor: pointer;
  }

  .ghost {
    border: 2px solid #2a2a2a;
    border-radius: 12px;
    background: #111;
    color: #cfcfcf;
    padding: 8px 12px;
    cursor: pointer;
  }

  .ghost:disabled,
  .primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .generated {
    border-radius: 14px;
    border: 1px solid rgba(163, 193, 1, 0.35);
    padding: 12px;
    background: rgba(163, 193, 1, 0.08);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .generated-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    color: #cfe27b;
    font-size: 13px;
  }

  .code-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 10px;
  }

  .code-pill {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 12px;
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: #fff;
    font-size: 13px;
  }

  .code-pill .copy {
    border: none;
    border-radius: 10px;
    padding: 4px 8px;
    background: #2b2b2b;
    color: #d0d0d0;
    font-size: 12px;
    cursor: pointer;
  }

  .stats {
    justify-content: space-between;
  }

  .stat-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 12px;
  }

  .stat {
    padding: 12px;
    border-radius: 14px;
    background: #101010;
    border: 1px solid #242424;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .stat .label {
    font-size: 12px;
    color: #7a7a7a;
  }

  .stat .value {
    font-size: 20px;
    color: #fff;
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .list-header,
  .list-row {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr) minmax(0, 1fr) minmax(0, 0.9fr)
      minmax(0, 0.9fr) minmax(0, 0.7fr);
    gap: 12px;
    align-items: center;
  }

  .list-header {
    font-size: 12px;
    color: #6d6d6d;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 0 6px;
  }

  .list-row {
    padding: 14px 12px;
    border-radius: 16px;
    border: 1px solid #1f1f1f;
    background: #0c0c0c;
  }

  .cell {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
    color: #d0d0d0;
  }

  .cell-label {
    display: none;
    font-size: 11px;
    color: #666;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .code-text {
    font-family: 'SFMono-Regular', 'Consolas', 'Liberation Mono', 'Menlo', monospace;
    letter-spacing: 0.08em;
  }

  .pill-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .pill {
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 12px;
    background: #1d1d1d;
    color: #d3d3d3;
  }

  .pill.enabled {
    background: rgba(163, 193, 1, 0.2);
    color: #a3c101;
  }

  .pill.disabled {
    background: rgba(194, 58, 43, 0.2);
    color: #ff9b91;
  }

  .pill.used {
    background: rgba(255, 193, 105, 0.2);
    color: #f0c36b;
  }

  .pill.unused {
    background: rgba(68, 193, 206, 0.2);
    color: #6dd6e0;
  }

  .user-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .muted {
    color: #6b6b6b;
  }

  .action-row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .action {
    border: none;
    border-radius: 10px;
    padding: 6px 12px;
    cursor: pointer;
    font-size: 12px;
    background: #1f1f1f;
    color: #fff;
  }

  .action[data-variant='enable'] {
    background: #a3c101;
    color: #000;
  }

  .action[data-variant='disable'] {
    background: #c23a2b;
  }

  .action[data-variant='copy'] {
    background: #2b2b2b;
    color: #d0d0d0;
  }

  .action:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .placeholder {
    color: #666;
    text-align: center;
    padding: 32px 0;
  }

  .error {
    color: #ff7b7b;
    font-size: 14px;
  }

  .success {
    color: #a3c101;
    font-size: 14px;
  }

  @media (max-width: 900px) {
    .list-header {
      display: none;
    }

    .list-row {
      grid-template-columns: 1fr;
    }

    .cell-label {
      display: block;
    }
  }
</style>
