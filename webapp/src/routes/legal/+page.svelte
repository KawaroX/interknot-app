<script lang="ts">
  import { onMount } from 'svelte';
  import PageShell from '$lib/components/PageShell.svelte';
  import { fetchLegalDocuments } from '$lib/api/legal';
  import type { LegalDocument } from '$lib/types';

  let documents: LegalDocument[] = [];
  let loading = true;
  let error = '';

  const loadDocuments = async () => {
    loading = true;
    error = '';
    try {
      documents = await fetchLegalDocuments();
    } catch (err) {
      error = err instanceof Error ? err.message : '加载条款失败';
    } finally {
      loading = false;
    }
  };

  const getDoc = (key: LegalDocument['key']) =>
    documents.find((doc) => doc.key === key);

  $: termsDoc = getDoc('terms_of_service');
  $: usageDoc = getDoc('usage_policy');

  onMount(() => {
    void loadDocuments();
  });
</script>

<PageShell>
  <div class="legal-page">
    <div class="header">
      <div>
        <h1>用户协议与隐私政策</h1>
        <p>请在使用服务前阅读并理解最新条款内容。</p>
      </div>
    </div>

    {#if loading}
      <div class="placeholder">加载中...</div>
    {:else if error}
      <div class="error">{error}</div>
    {:else}
      <section class="doc">
        <div class="doc-head">
          <h2>{termsDoc?.title ?? '用户协议'}</h2>
          <span class="version">版本：{termsDoc?.version ?? 'draft'}</span>
        </div>
        <div class="doc-body">{termsDoc?.body ?? ''}</div>
      </section>

      <section class="doc">
        <div class="doc-head">
          <h2>{usageDoc?.title ?? '隐私政策'}</h2>
          <span class="version">版本：{usageDoc?.version ?? 'draft'}</span>
        </div>
        <div class="doc-body">{usageDoc?.body ?? ''}</div>
      </section>
    {/if}
  </div>
</PageShell>

<style>
  .legal-page {
    display: flex;
    flex-direction: column;
    gap: 20px;
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

  .doc {
    border-radius: 18px;
    border: 2px solid #1f1f1f;
    background: #0b0b0b;
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .doc-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  h2 {
    margin: 0;
    font-size: 18px;
  }

  .version {
    font-size: 12px;
    color: #7a7a7a;
  }

  .doc-body {
    color: #cfcfcf;
    font-size: 13px;
    line-height: 1.7;
    white-space: pre-line;
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
</style>
