<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import PageShell from '$lib/components/PageShell.svelte';
  import { fetchLegalDocuments, updateLegalDocuments } from '$lib/api/legal';
  import { defaultLegalDocuments } from '$lib/data/legalDrafts';
  import { pb } from '$lib/api/pb';
  import { session } from '$lib/stores/session';
  import type { LegalDocument } from '$lib/types';

  let termsDraft: LegalDocument = {
    key: 'terms_of_service',
    title: '用户协议',
    body: '',
    version: '',
  };
  let usageDraft: LegalDocument = {
    key: 'usage_policy',
    title: '隐私政策',
    body: '',
    version: '',
  };
  let termsUpdatedAt = '';
  let usageUpdatedAt = '';
  let loading = true;
  let saving = false;
  let error = '';
  let message = '';
  let roleChecked = false;

  let snapshot: { terms: LegalDocument; usage: LegalDocument } | null = null;

  const refreshRole = async () => {
    if (!browser) return;
    if (!pb.authStore.isValid) {
      roleChecked = true;
      return;
    }
    try {
      await pb.collection('users').authRefresh();
    } catch (err) {
      console.error('legal_admin_auth_refresh_failed', err);
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

  const buildDraft = (doc: LegalDocument | undefined, key: LegalDocument['key']) => ({
    key,
    title: doc?.title ?? (key === 'terms_of_service' ? '用户协议' : '隐私政策'),
    body: doc?.body ?? '',
    version: doc?.version ?? '',
  });

  const loadDocuments = async () => {
    if (!$session || !canManage()) return;
    loading = true;
    error = '';
    message = '';
    try {
      const documents = await fetchLegalDocuments();
      const terms = documents.find((doc) => doc.key === 'terms_of_service');
      const usage = documents.find((doc) => doc.key === 'usage_policy');
      termsDraft = buildDraft(terms, 'terms_of_service');
      usageDraft = buildDraft(usage, 'usage_policy');
      termsUpdatedAt = terms?.updatedAt ?? '';
      usageUpdatedAt = usage?.updatedAt ?? '';
      snapshot = { terms: { ...termsDraft }, usage: { ...usageDraft } };
    } catch (err) {
      error = err instanceof Error ? err.message : '加载失败';
    } finally {
      loading = false;
    }
  };

  const normalizeDoc = (doc: LegalDocument) => ({
    ...doc,
    title: doc.title.trim(),
    body: doc.body.trim(),
    version: doc.version.trim(),
  });

  const validateDoc = (doc: LegalDocument) => {
    if (!doc.title.trim()) return '标题不能为空';
    if (!doc.version.trim()) return '版本不能为空';
    if (!doc.body.trim()) return '内容不能为空';
    return '';
  };

  const saveDocuments = async () => {
    error = '';
    message = '';
    const termsError = validateDoc(termsDraft);
    const usageError = validateDoc(usageDraft);
    if (termsError || usageError) {
      error = termsError || usageError;
      return;
    }
    saving = true;
    try {
      const documents = await updateLegalDocuments([
        normalizeDoc(termsDraft),
        normalizeDoc(usageDraft),
      ]);
      const terms = documents.find((doc) => doc.key === 'terms_of_service');
      const usage = documents.find((doc) => doc.key === 'usage_policy');
      termsUpdatedAt = terms?.updatedAt ?? termsUpdatedAt;
      usageUpdatedAt = usage?.updatedAt ?? usageUpdatedAt;
      snapshot = { terms: { ...termsDraft }, usage: { ...usageDraft } };
      message = '条款已保存';
    } catch (err) {
      error = err instanceof Error ? err.message : '保存失败';
    } finally {
      saving = false;
    }
  };

  const resetDrafts = () => {
    if (!snapshot) return;
    termsDraft = { ...snapshot.terms };
    usageDraft = { ...snapshot.usage };
    message = '已恢复上次保存内容';
    error = '';
  };

  const loadDefaults = () => {
    const terms = defaultLegalDocuments.find((doc) => doc.key === 'terms_of_service');
    const usage = defaultLegalDocuments.find((doc) => doc.key === 'usage_policy');
    if (!terms || !usage) return;
    termsDraft = { ...terms };
    usageDraft = { ...usage };
    message = '已载入默认条款模板';
    error = '';
  };

  const formatDate = (value: string | undefined) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('zh-CN', { hour12: false });
  };

  onMount(() => {
    void (async () => {
      await refreshRole();
      await loadDocuments();
    })();
  });
</script>

<PageShell>
  <div class="legal-admin">
    <div class="header">
      <div>
        <h1>条款管理</h1>
        <p>编辑用户协议与隐私政策，更新后立即对新注册用户生效。</p>
      </div>
      <div class="header-actions">
        <button class="ghost" type="button" on:click={loadDocuments} disabled={loading}>
          刷新
        </button>
        <button class="ghost" type="button" on:click={loadDefaults} disabled={saving}>
          使用默认模板
        </button>
        <button class="ghost" type="button" on:click={resetDrafts} disabled={!snapshot || saving}>
          还原上次保存
        </button>
        <button class="primary" type="button" on:click={saveDocuments} disabled={saving || loading}>
          {saving ? '保存中...' : '保存条款'}
        </button>
      </div>
    </div>

    {#if message}
      <div class="success">{message}</div>
    {/if}
    {#if error}
      <div class="error">{error}</div>
    {/if}

    <div class="panel-grid">
      <section class="panel">
        <div class="panel-title">用户协议</div>
        <label>
          标题
          <input type="text" bind:value={termsDraft.title} />
        </label>
        <label>
          版本
          <input type="text" bind:value={termsDraft.version} placeholder="例如 2026-01-26" />
        </label>
        <label>
          内容
          <textarea rows="12" bind:value={termsDraft.body}></textarea>
        </label>
        <div class="meta">最近更新：{formatDate(termsUpdatedAt)}</div>
      </section>

      <section class="panel">
        <div class="panel-title">隐私政策</div>
        <label>
          标题
          <input type="text" bind:value={usageDraft.title} />
        </label>
        <label>
          版本
          <input type="text" bind:value={usageDraft.version} placeholder="例如 2026-01-26" />
        </label>
        <label>
          内容
          <textarea rows="12" bind:value={usageDraft.body}></textarea>
        </label>
        <div class="meta">最近更新：{formatDate(usageUpdatedAt)}</div>
      </section>
    </div>
  </div>
</PageShell>

<style>
  .legal-admin {
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
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
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

  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 12px;
    color: #b5b5b5;
  }

  input,
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
    min-height: 220px;
    line-height: 1.6;
  }

  .meta {
    font-size: 11px;
    color: #6d6d6d;
  }

  .primary {
    border: none;
    border-radius: 12px;
    padding: 8px 14px;
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

  .primary:disabled,
  .ghost:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .error {
    color: #ff7b7b;
    font-size: 14px;
  }

  .success {
    color: #a3c101;
    font-size: 14px;
  }
</style>
