<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { fetchLegalDocuments } from '$lib/api/legal';
  import { pb } from '$lib/api/pb';
  import { session } from '$lib/stores/session';
  import type { LegalDocument } from '$lib/types';

  let error = '';
  let notice = '';
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
  let termsDoc: LegalDocument | undefined;
  let usageDoc: LegalDocument | undefined;
  let agreed = false;
  let showTermsConfirm = false;
  let pendingLoginAction: 'github' | 'password' | null = null;
  let email = '';
  let password = '';
  let registerEmail = '';
  let registerPassword = '';
  let registerPasswordConfirm = '';
  let registerInviteCode = '';
  let registerUsername = '';
  let usernameError = '';
  let usernameChecking = false;
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

  const clearMessages = () => {
    error = '';
    notice = '';
  };

  const ensureDisplayName = async (meta?: unknown) => {
    const record = pb.authStore.model;
    if (!record) return;
    const recordId = String(record.get?.('id') ?? record.id ?? '').trim();
    if (!recordId) return;
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
      const updated = await pb.collection('users').update(recordId, {
        name: nextName,
      });
      pb.authStore.save(pb.authStore.token, updated);
    } catch (err) {
      console.error('login_name_update_failed', err);
    }
  };

  const selectDoc = async (key: LegalDocument['key']) => {
    activeDoc = key;
    await tick();
  };

  const getVersion = (doc: LegalDocument | undefined) => {
    const version = doc?.version ?? '';
    return version.trim() || 'draft';
  };

  const confirmTermsAndProceed = () => {
    agreed = true;
    showTermsConfirm = false;
    const action = pendingLoginAction;
    pendingLoginAction = null;
    if (action === 'github') {
      void doLoginWithGithub();
    } else if (action === 'password') {
      void doLoginWithPassword();
    }
  };

  const cancelTermsConfirm = () => {
    showTermsConfirm = false;
    pendingLoginAction = null;
  };

  const doLoginWithGithub = async () => {
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
      await verifyInviteAfterLogin();
      goto('/');
    } catch (err) {
      const message = formatPbError(err);
      error = message ? `GitHub 登录失败：${message}` : 'GitHub 登录失败';
    } finally {
      loading = false;
    }
  };

  const loginWithGithub = async () => {
    clearMessages();
    if (!agreed) {
      pendingLoginAction = 'github';
      showTermsConfirm = true;
      return;
    }
    await doLoginWithGithub();
  };

  const doLoginWithPassword = async () => {
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
      await verifyInviteAfterLogin();
      goto('/');
    } catch (err) {
      const message = formatPbError(err);
      error = message ? `账号密码登录失败：${message}` : '账号密码登录失败';
    } finally {
      passwordLoading = false;
    }
  };

  const resendVerification = async () => {
    clearMessages();
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      error = '请输入账号邮箱。';
      return;
    }
    try {
      await pb.collection('users').requestVerification(trimmedEmail);
      notice = '验证邮件已发送，请检查邮箱。';
    } catch (err) {
      const message = formatPbError(err);
      error = message ? `发送验证邮件失败：${message}` : '发送验证邮件失败';
    }
  };

  const loginWithPassword = async () => {
    clearMessages();
    if (!agreed) {
      pendingLoginAction = 'password';
      showTermsConfirm = true;
      return;
    }
    await doLoginWithPassword();
  };

  const registerWithEmail = async () => {
    clearMessages();
    usernameError = '';
    if (!agreed) {
      pendingLoginAction = null;
      showTermsConfirm = true;
      return;
    }
    if (legalError) {
      error = '条款加载失败，请稍后再试。';
      return;
    }
    const trimmedEmail = registerEmail.trim();
    const trimmedUsername = registerUsername.trim();
    if (!trimmedEmail || !registerPassword || !registerPasswordConfirm) {
      error = '请输入注册邮箱与密码。';
      return;
    }
    if (!trimmedUsername) {
      error = '请输入用户名。';
      return;
    }
    if (trimmedUsername.length < 2 || trimmedUsername.length > 20) {
      error = '用户名需为 2-20 个字符。';
      return;
    }
    if (registerPassword !== registerPasswordConfirm) {
      error = '两次输入的密码不一致。';
      return;
    }
    try {
      registerLoading = true;
      // Check username availability (no auth needed for new user)
      try {
        const checkRes = await fetch(`/api/users/check-name-public?name=${encodeURIComponent(trimmedUsername)}`);
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          if (!checkData.available) {
            error = '用户名已被占用，请换一个。';
            registerLoading = false;
            return;
          }
        }
      } catch {
        // If check fails, continue with registration and let PocketBase handle uniqueness
      }
      const inviteCode = registerInviteCode.trim();
      const termsVersion = getVersion(termsDoc);
      const usageVersion = getVersion(usageDoc);
      const acceptedAt = new Date().toISOString();
      const payload: Record<string, unknown> = {
        email: trimmedEmail,
        password: registerPassword,
        passwordConfirm: registerPasswordConfirm,
        name: trimmedUsername,
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
      try {
        await pb.collection('users').requestVerification(trimmedEmail);
        notice = '验证邮件已发送，请前往邮箱完成验证后再登录。';
        showRegister = false;
        email = trimmedEmail;
        registerPassword = '';
        registerPasswordConfirm = '';
      } catch (sendErr) {
        const message = formatPbError(sendErr);
        error = message
          ? `验证邮件发送失败：${message}。账号已创建，请稍后重试发送验证邮件。`
          : '验证邮件发送失败。账号已创建，请稍后重试发送验证邮件。';
      }
    } catch (err) {
      const message = formatPbError(err);
      error = message ? `邮箱注册失败：${message}` : '邮箱注册失败';
    } finally {
      registerLoading = false;
    }
  };

  const verifyInviteAfterLogin = async () => {
    const record = pb.authStore.model;
    if (!record) return;
    const inviteCode = String(record.get?.('invite_code') ?? record.invite_code ?? '').trim();
    if (!inviteCode) return;
    try {
      await fetch('/api/users/verify-invite', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${pb.authStore.token}`,
        },
      });
    } catch {
      // Invite verification failed silently, user can still use the site
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
    }
  };

  $: termsDoc = legalDocuments.find((doc) => doc.key === 'terms_of_service');
  $: usageDoc = legalDocuments.find((doc) => doc.key === 'usage_policy');

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
            <div class="legal-sub">请阅读条款内容，勾选下方同意框即可注册或登录。</div>
          </div>
          {#if legalLoading}
            <span class="legal-tag">加载中</span>
          {:else if legalError}
            <span class="legal-tag error">加载失败</span>
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
          </button>
          <button
            class="legal-tab"
            class:active={activeDoc === 'usage_policy'}
            type="button"
            on:click={() => selectDoc('usage_policy')}
            disabled={legalLoading || Boolean(legalError)}
          >
            <span>{usageDoc?.title ?? '隐私政策'}</span>
          </button>
        </div>
        {#if legalLoading}
          <div class="legal-body placeholder">条款加载中...</div>
        {:else if legalError}
          <div class="legal-body placeholder error">{legalError}</div>
        {:else}
          <div class="legal-body" bind:this={legalScroll}>
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
              disabled={legalLoading || Boolean(legalError)}
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
              用户名（2-20字）
              <input
                type="text"
                bind:value={registerUsername}
                autocomplete="nickname"
                placeholder="请输入用户名"
                minlength="2"
                maxlength="20"
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
                !registerUsername.trim() ||
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
            <button class="link-btn" type="button" on:click={() => (showRegister = true)}>
              没有账号？邮箱注册
            </button>
            <button class="link-btn" type="button" on:click={resendVerification}>
              没收到验证邮件？重新发送
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
        {/if}
        {#if notice}
          <div class="notice">{notice}</div>
        {/if}
        {#if error}
          <div class="error">{error}</div>
        {/if}
        </div>
      {/if}
    </div>
  </div>
</div>

{#if showTermsConfirm}
  <div class="modal-overlay" on:click={cancelTermsConfirm}>
    <div class="modal" on:click|stopPropagation>
      <div class="modal-title">确认同意条款</div>
      <div class="modal-body">
        <p>您尚未勾选同意《用户协议》和《隐私政策》。</p>
        <p>是否同意并继续{pendingLoginAction === 'github' ? 'GitHub登录' : pendingLoginAction === 'password' ? '登录' : '注册'}？</p>
      </div>
      <div class="modal-footer">
        <button class="modal-btn cancel" type="button" on:click={cancelTermsConfirm}>
          取消
        </button>
        <button class="modal-btn confirm" type="button" on:click={confirmTermsAndProceed}>
          同意并继续
        </button>
      </div>
    </div>
  </div>
{/if}

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

  .error {
    color: #ff7b7b;
  }

  .notice {
    color: #c8d38a;
  }

  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 16px;
  }

  .modal {
    background: #0b0b0b;
    border: 2px solid #1f1f1f;
    border-radius: 16px;
    padding: 24px;
    max-width: 400px;
    width: 100%;
  }

  .modal-title {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 16px;
    color: #fff;
  }

  .modal-body {
    color: #cfcfcf;
    font-size: 14px;
    line-height: 1.6;
    margin-bottom: 20px;
  }

  .modal-body p {
    margin: 0 0 8px 0;
  }

  .modal-footer {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  }

  .modal-btn {
    border: none;
    border-radius: 8px;
    padding: 8px 16px;
    font-size: 14px;
    cursor: pointer;
    transition: opacity 0.2s;
  }

  .modal-btn:hover {
    opacity: 0.9;
  }

  .modal-btn.cancel {
    background: #2a2a2a;
    color: #fff;
  }

  .modal-btn.confirm {
    background: #a3c101;
    color: #000;
  }
</style>
