<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { fetchLegalDocuments } from '$lib/api/legal';
  import { pb } from '$lib/api/pb';
  import { session } from '$lib/stores/session';
  import type { LegalDocument } from '$lib/types';

  let error = '';
  let legalError = '';
  let loading = false;
  let passwordLoading = false;
  let registerLoading = false;
  let legalLoading = true;
  let legalDocuments: LegalDocument[] = [];
  let activeDoc: LegalDocument['key'] = 'terms_of_service';
  let mobileTab: 'legal' | 'login' = 'legal';
  let isCompact = false;
  let showRegister = false;
  let readStatus: Record<LegalDocument['key'], boolean> = {
    terms_of_service: false,
    usage_policy: false,
  };
  let termsDoc: LegalDocument | undefined;
  let usageDoc: LegalDocument | undefined;
  let canAgree = false;
  let agreed = false;
  let email = '';
  let password = '';
  let registerEmail = '';
  let registerPassword = '';
  let registerPasswordConfirm = '';
  let registerInviteCode = '';
  let legalScroll: HTMLDivElement | null = null;

  $: if ($session) {
    goto('/');
  }

  const fallbackPrefix = 'GitHub用户';

  const buildFallbackName = () => {
    const suffix = Math.random().toString(36).slice(2, 6);
    return `${fallbackPrefix}${suffix}`;
  };

  const extractProviderName = (meta: unknown) => {
    if (!meta || typeof meta !== 'object') return '';
    const payload = meta as {
      name?: string;
      username?: string;
      email?: string;
      rawUser?: { name?: string; login?: string; email?: string };
    };
    return (
      payload.name ||
      payload.rawUser?.name ||
      payload.rawUser?.login ||
      payload.username ||
      ''
    ).trim();
  };

  const formatPbError = (err: unknown) => {
    if (!err || typeof err !== 'object') return '';
    const payload = err as {
      message?: string;
      data?: { message?: string; data?: Record<string, { message?: string }> };
    };
    const baseMessage = payload.data?.message ?? payload.message ?? '';
    const fieldData = payload.data?.data ?? {};
    const fieldMessages = Object.entries(fieldData).map(([field, detail]) => {
      const info = detail as { message?: string };
      return `${field}: ${info.message ?? 'invalid'}`;
    });
    if (fieldMessages.length === 0) return baseMessage;
    const suffix = fieldMessages.join(', ');
    return baseMessage ? `${baseMessage} (${suffix})` : suffix;
  };

  const ensureDisplayName = async (meta?: unknown) => {
    const record = pb.authStore.model;
    if (!record) return;
    const currentName = String(record.get?.('name') ?? record.name ?? '').trim();
    const providerName = extractProviderName(meta);
    const email = String(record.get?.('email') ?? record.email ?? '').trim();
    const fallbackBase = email ? email.split('@')[0] ?? '' : '';
    const fallback = fallbackBase || buildFallbackName();
    const nextName = (providerName || fallback).slice(0, 20);
    if (!nextName) return;
    const shouldUpdate = !currentName || currentName.startsWith(fallbackPrefix);
    if (!shouldUpdate || currentName === nextName) return;
    try {
      const updated = await pb.collection('users').update(record.id, {
        name: nextName,
      });
      pb.authStore.save(pb.authStore.token, updated);
    } catch (err) {
      console.error('login_name_update_failed', err);
    }
  };

  const markRead = (key: LegalDocument['key']) => {
    if (readStatus[key]) return;
    readStatus = { ...readStatus, [key]: true };
  };

  const checkScroll = () => {
    if (!legalScroll) return;
    const { scrollTop, scrollHeight, clientHeight } = legalScroll;
    if (scrollHeight <= clientHeight + 4) {
      markRead(activeDoc);
      return;
    }
    if (scrollTop + clientHeight >= scrollHeight - 4) {
      markRead(activeDoc);
    }
  };

  const handleScroll = () => {
    checkScroll();
  };

  const selectDoc = async (key: LegalDocument['key']) => {
    activeDoc = key;
    await tick();
    if (legalScroll) {
      legalScroll.scrollTop = 0;
    }
    checkScroll();
  };

  const getVersion = (doc: LegalDocument | undefined) => {
    const version = doc?.version ?? '';
    return version.trim() || 'draft';
  };

  const loginWithGithub = async () => {
    error = '';
    if (!agreed || !readStatus.terms_of_service || !readStatus.usage_policy) {
      error = '请先阅读并同意用户协议与隐私政策。';
      return;
    }
    if (legalError) {
      error = '条款加载失败，请稍后再试。';
      return;
    }
    try {
      loading = true;
      const fallbackName = buildFallbackName();
      const termsVersion = getVersion(termsDoc);
      const usageVersion = getVersion(usageDoc);
      const acceptedAt = new Date().toISOString();
      const authData = await pb.collection('users').authWithOAuth2({
        provider: 'github',
        scopes: ['user:email'],
        createData: {
          name: fallbackName,
          can_post: true,
          terms_version: termsVersion,
          terms_accepted_at: acceptedAt,
          usage_version: usageVersion,
          usage_accepted_at: acceptedAt,
        },
      });
      await ensureDisplayName(authData?.meta);
      goto('/');
    } catch (err) {
      const message = formatPbError(err);
      error = message ? `GitHub 登录失败：${message}` : 'GitHub 登录失败';
    } finally {
      loading = false;
    }
  };

  const loginWithPassword = async () => {
    error = '';
    if (!agreed || !readStatus.terms_of_service || !readStatus.usage_policy) {
      error = '请先阅读并同意用户协议与隐私政策。';
      return;
    }
    if (legalError) {
      error = '条款加载失败，请稍后再试。';
      return;
    }
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      error = '请输入账号邮箱与密码。';
      return;
    }
    try {
      passwordLoading = true;
      await pb.collection('users').authWithPassword(trimmedEmail, password);
      goto('/');
    } catch (err) {
      const message = formatPbError(err);
      error = message ? `账号密码登录失败：${message}` : '账号密码登录失败';
    } finally {
      passwordLoading = false;
    }
  };

  const registerWithEmail = async () => {
    error = '';
    if (!agreed || !readStatus.terms_of_service || !readStatus.usage_policy) {
      error = '请先阅读并同意用户协议与隐私政策。';
      return;
    }
    if (legalError) {
      error = '条款加载失败，请稍后再试。';
      return;
    }
    const trimmedEmail = registerEmail.trim();
    if (!trimmedEmail || !registerPassword || !registerPasswordConfirm) {
      error = '请输入注册邮箱与密码。';
      return;
    }
    if (registerPassword !== registerPasswordConfirm) {
      error = '两次输入的密码不一致。';
      return;
    }
    try {
      registerLoading = true;
      const fallbackBase = trimmedEmail.split('@')[0] ?? '';
      const fallbackName = (fallbackBase || buildFallbackName()).slice(0, 20);
      const inviteCode = registerInviteCode.trim();
      const termsVersion = getVersion(termsDoc);
      const usageVersion = getVersion(usageDoc);
      const acceptedAt = new Date().toISOString();
      const payload: Record<string, unknown> = {
        email: trimmedEmail,
        password: registerPassword,
        passwordConfirm: registerPasswordConfirm,
        name: fallbackName,
        can_post: false,
        terms_version: termsVersion,
        terms_accepted_at: acceptedAt,
        usage_version: usageVersion,
        usage_accepted_at: acceptedAt,
      };
      if (inviteCode) {
        payload.invite_code = inviteCode;
      }
      await pb.collection('users').create(payload);
      await pb.collection('users').authWithPassword(trimmedEmail, registerPassword);
      goto('/');
    } catch (err) {
      const message = formatPbError(err);
      error = message ? `邮箱注册失败：${message}` : '邮箱注册失败';
    } finally {
      registerLoading = false;
    }
  };

  const loadLegalDocuments = async () => {
    legalLoading = true;
    legalError = '';
    try {
      legalDocuments = await fetchLegalDocuments();
    } catch (err) {
      legalError = err instanceof Error ? err.message : '加载条款失败';
    } finally {
      legalLoading = false;
      await tick();
      checkScroll();
    }
  };

  $: termsDoc = legalDocuments.find((doc) => doc.key === 'terms_of_service');
  $: usageDoc = legalDocuments.find((doc) => doc.key === 'usage_policy');
  $: canAgree =
    readStatus.terms_of_service && readStatus.usage_policy && !legalLoading && !legalError;

  onMount(() => {
    void loadLegalDocuments();
    const media = window.matchMedia('(max-width: 900px)');
    const updateLayout = () => {
      isCompact = media.matches;
      if (!isCompact) {
        mobileTab = 'legal';
      }
    };
    updateLayout();
    media.addEventListener('change', updateLayout);
    return () => {
      media.removeEventListener('change', updateLayout);
    };
  });
</script>

<div class="login">
  <div class="panel">
    <h1>登录</h1>
    {#if isCompact}
      <div class="mobile-tabs">
        <button
          type="button"
          class:active={mobileTab === 'legal'}
          on:click={() => (mobileTab = 'legal')}
        >
          条款
        </button>
        <button
          type="button"
          class:active={mobileTab === 'login'}
          on:click={() => (mobileTab = 'login')}
        >
          登录/注册
        </button>
      </div>
    {/if}
    <div class="panel-body">
      {#if !isCompact || mobileTab === 'legal'}
        <div class="legal-block">
        <div class="legal-head">
          <div>
            <div class="legal-title">用户协议与隐私政策</div>
            <div class="legal-sub">请阅读条款内容并滚动到底后勾选同意。</div>
          </div>
          {#if legalLoading}
            <span class="legal-tag">加载中</span>
          {:else if legalError}
            <span class="legal-tag error">加载失败</span>
          {:else}
            <span class="legal-tag">{canAgree ? '已读' : '未读'}</span>
          {/if}
        </div>
        <div class="legal-tabs">
          <button
            class="legal-tab"
            class:active={activeDoc === 'terms_of_service'}
            type="button"
            on:click={() => selectDoc('terms_of_service')}
            disabled={legalLoading || Boolean(legalError)}
          >
            <span>{termsDoc?.title ?? '用户协议'}</span>
            {#if readStatus.terms_of_service}
              <span class="read-tag">已读</span>
            {/if}
          </button>
          <button
            class="legal-tab"
            class:active={activeDoc === 'usage_policy'}
            type="button"
            on:click={() => selectDoc('usage_policy')}
            disabled={legalLoading || Boolean(legalError)}
          >
            <span>{usageDoc?.title ?? '隐私政策'}</span>
            {#if readStatus.usage_policy}
              <span class="read-tag">已读</span>
            {/if}
          </button>
        </div>
        {#if legalLoading}
          <div class="legal-body placeholder">条款加载中...</div>
        {:else if legalError}
          <div class="legal-body placeholder error">{legalError}</div>
        {:else}
          <div class="legal-body" bind:this={legalScroll} on:scroll={handleScroll}>
            <div class="legal-text">
              {#if activeDoc === 'terms_of_service'}
                {termsDoc?.body ?? ''}
              {:else}
                {usageDoc?.body ?? ''}
              {/if}
            </div>
          </div>
          <div class="legal-meta">
            版本：
            {#if activeDoc === 'terms_of_service'}
              {termsDoc?.version ?? 'draft'}
            {:else}
              {usageDoc?.version ?? 'draft'}
            {/if}
          </div>
        {/if}
        <div class="legal-footer">
          <label class="agree">
            <input
              type="checkbox"
              bind:checked={agreed}
              disabled={!canAgree || Boolean(legalError)}
            />
            <span>
              我已阅读并同意《{termsDoc?.title ?? '用户协议'}》《{usageDoc?.title ?? '隐私政策'}》
            </span>
          </label>
          <a class="legal-link" href="/legal" target="_blank" rel="noreferrer">新窗口查看完整条款</a>
        </div>
        </div>
      {/if}
      {#if !isCompact || mobileTab === 'login'}
        <div class="login-methods">
        {#if showRegister}
          <div class="register-block">
            <div class="password-title">邮箱注册</div>
            <label>
              注册邮箱
              <input
                type="email"
                bind:value={registerEmail}
                autocomplete="username"
                placeholder="you@example.com"
              />
            </label>
            <label>
              设置密码
              <input
                type="password"
                bind:value={registerPassword}
                autocomplete="new-password"
                placeholder="请输入密码"
              />
            </label>
            <label>
              确认密码
              <input
                type="password"
                bind:value={registerPasswordConfirm}
                autocomplete="new-password"
                placeholder="再次输入密码"
              />
            </label>
            <label>
              邀请码（可选）
              <input
                type="text"
                bind:value={registerInviteCode}
                placeholder="填写邀请码可直接发言"
              />
            </label>
            <button
              class="password-btn"
              type="button"
              on:click={registerWithEmail}
              disabled={
                registerLoading ||
                loading ||
                passwordLoading ||
                !registerEmail.trim() ||
                !registerPassword ||
                !registerPasswordConfirm
              }
            >
              {registerLoading ? '注册中...' : '创建账号'}
            </button>
            <div class="password-note">无邀请码可先注册，但发言需要填写邀请码。</div>
            <button class="link-btn" type="button" on:click={() => (showRegister = false)}>
              返回登录
            </button>
          </div>
        {:else}
          <div class="password-block">
            <div class="password-title">账号密码登录</div>
            <label>
              账号邮箱
              <input
                type="email"
                bind:value={email}
                autocomplete="username"
                placeholder="admin@example.com"
              />
            </label>
            <label>
              密码
              <input
                type="password"
                bind:value={password}
                autocomplete="current-password"
                placeholder="请输入密码"
              />
            </label>
            <button
              class="password-btn"
              type="button"
              on:click={loginWithPassword}
              disabled={passwordLoading || loading || registerLoading || !email.trim() || !password}
            >
              {passwordLoading ? '登录中...' : '账号密码登录'}
            </button>
            <div class="password-note">仅用于管理员账号登录</div>
            <button class="link-btn" type="button" on:click={() => (showRegister = true)}>
              没有账号？邮箱注册
            </button>
          </div>
          <button
            class="github"
            type="button"
            on:click={loginWithGithub}
            disabled={loading || passwordLoading || registerLoading}
          >
            {loading ? '登录中...' : '使用 GitHub 登录'}
          </button>
          <div class="note">普通用户仅支持 GitHub 登录</div>
        {/if}
        {#if error}
          <div class="error">{error}</div>
        {/if}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .login {
    min-height: 100vh;
    width: 100%;
    max-width: 100vw;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px 16px;
    background: radial-gradient(circle at top, #121212 0%, #020202 60%);
  }

  .panel {
    width: min(980px, 100%);
    background: #0b0b0b;
    border: 2px solid #1f1f1f;
    border-radius: 18px;
    padding: 36px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  @media (max-width: 900px) {
    .panel {
      padding: 22px 18px;
      border-radius: 16px;
    }
  }

  h1 {
    margin: 0;
    font-size: 24px;
  }

  .panel-body {
    display: flex;
    align-items: flex-start;
    gap: 24px;
  }

  .mobile-tabs {
    display: none;
    gap: 10px;
  }

  .mobile-tabs button {
    flex: 1;
    border: 1px solid #2a2a2a;
    border-radius: 999px;
    padding: 8px 12px;
    background: #121212;
    color: #bdbdbd;
    font-size: 13px;
    cursor: pointer;
  }

  .mobile-tabs button.active {
    background: #a3c101;
    color: #000;
    border-color: #a3c101;
  }

  @media (max-width: 900px) {
    .mobile-tabs {
      display: flex;
    }
  }

  @media (max-width: 900px) {
    .panel-body {
      flex-direction: column;
      gap: 16px;
    }
  }

  .legal-block {
    display: flex;
    flex-direction: column;
    gap: 12px;
    border-radius: 16px;
    border: 1px solid #1f1f1f;
    background: #0f0f0f;
    padding: 14px;
    flex: 1.2;
    min-width: 0;
  }

  .login-methods {
    display: flex;
    flex-direction: column;
    gap: 14px;
    flex: 1;
    min-width: 280px;
  }

  @media (max-width: 900px) {
    .legal-block,
    .login-methods {
      width: 100%;
    }
  }

  .legal-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .legal-title {
    font-size: 14px;
    color: #fff;
  }

  .legal-sub {
    margin-top: 4px;
    font-size: 12px;
    color: #6b6b6b;
  }

  .legal-tag {
    font-size: 11px;
    color: #bdbdbd;
    border: 1px solid #2a2a2a;
    border-radius: 999px;
    padding: 2px 8px;
  }

  .legal-tag.error {
    color: #ff9b91;
    border-color: rgba(194, 58, 43, 0.4);
    background: rgba(194, 58, 43, 0.12);
  }

  .legal-tabs {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .legal-tab {
    border: 1px solid #2a2a2a;
    border-radius: 999px;
    padding: 6px 10px;
    background: #121212;
    color: #d6d6d6;
    font-size: 12px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }

  .legal-tab.active {
    background: #a3c101;
    color: #000;
    border-color: #a3c101;
  }

  .legal-tab:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .read-tag {
    font-size: 11px;
    padding: 1px 6px;
    border-radius: 999px;
    background: rgba(163, 193, 1, 0.18);
    color: #a3c101;
  }

  .legal-tab.active .read-tag {
    background: rgba(0, 0, 0, 0.25);
    color: #000;
  }

  .legal-body {
    max-height: 220px;
    overflow-y: auto;
    padding: 12px;
    border-radius: 12px;
    border: 1px solid #202020;
    background: #070707;
    color: #cfcfcf;
    font-size: 12px;
    line-height: 1.6;
  }

  .legal-body.placeholder {
    min-height: 160px;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    color: #7a7a7a;
  }

  .legal-body.placeholder.error {
    color: #ff9b91;
  }

  .legal-text {
    white-space: pre-line;
  }

  .legal-meta {
    text-align: right;
    font-size: 11px;
    color: #666;
  }

  .legal-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .agree {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: #d6d6d6;
  }

  .agree input {
    accent-color: #a3c101;
  }

  .legal-link {
    font-size: 12px;
    color: #a3c101;
    text-decoration: none;
  }

  .legal-link:hover {
    text-decoration: underline;
  }

  .password-block,
  .register-block {
    display: flex;
    flex-direction: column;
    gap: 10px;
    border-radius: 16px;
    border: 1px solid #1f1f1f;
    background: #0f0f0f;
    padding: 14px;
  }

  .password-title {
    font-size: 14px;
    color: #fff;
  }

  .password-block label,
  .register-block label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 12px;
    color: #b5b5b5;
  }

  .password-block input,
  .register-block input {
    background: #101010;
    border: 2px solid #2a2a2a;
    border-radius: 12px;
    color: #fff;
    padding: 8px 10px;
    font-size: 13px;
  }

  .password-btn {
    border: none;
    border-radius: 12px;
    padding: 10px;
    background: #1f1f1f;
    color: #fff;
    cursor: pointer;
  }

  .link-btn {
    border: none;
    background: transparent;
    color: #a3c101;
    font-size: 12px;
    cursor: pointer;
    padding: 0;
    text-align: left;
  }

  .password-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .password-note {
    font-size: 12px;
    color: #6b6b6b;
  }

  .github {
    border: none;
    border-radius: 12px;
    padding: 10px;
    background: #1f1f1f;
    color: #fff;
    cursor: pointer;
  }

  .github:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .note {
    text-align: center;
    color: #6b6b6b;
    font-size: 13px;
  }

  .error {
    color: #ff7b7b;
  }
</style>
