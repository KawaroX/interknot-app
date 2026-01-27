<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { browser } from '$app/environment';
  import Avatar from './common/Avatar.svelte';
  import { buildFileUrl } from '$lib/api/files';
  import { defaultAvatar } from '$lib/data/characters';
  import { session } from '$lib/stores/session';
  import { openCompose } from '$lib/stores/popup';
  import { messages, loadMessages } from '$lib/stores/messages';
  import { loadPosts, searchQuery } from '$lib/stores/posts';

  const repoUrl = 'https://github.com/KawaroX/inter-knot-old';

  $: user = $session;
  $: avatarUrl = user?.avatar
    ? buildFileUrl(user, user.avatar) ?? defaultAvatar
    : defaultAvatar;
  $: userName = user?.name ?? '未登录';
  $: isAdmin = (user?.role ?? 'user') === 'admin';
  let loadedFor = '';

  $: if (browser && user?.id && loadedFor !== user.id) {
    loadedFor = user.id;
    void loadMessages();
  }

  $: isHome = $page.url.pathname === '/';
  $: isMessages = $page.url.pathname === '/messages';

  let searchInput = $searchQuery;
  let searchTimer: ReturnType<typeof setTimeout>;
  let searchOpen = false;

  const onSearch = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      void loadPosts(searchInput);
    }, 500);
  };

  const toggleSearch = () => {
    searchOpen = !searchOpen;
    if (!searchOpen && searchInput) {
        searchInput = '';
        void loadPosts('');
    }
  };

  const messageType = (message: { messageType?: string }) =>
    (message.messageType ?? 'system') as 'system' | 'like' | 'comment';

  $: hasSystemUnread = $messages.some(
    (message) => messageType(message) === 'system' && message.status === 'unread',
  );
  $: hasLikeUnread = $messages.some(
    (message) => messageType(message) === 'like' && message.status === 'unread',
  );
  $: hasCommentUnread = $messages.some(
    (message) => messageType(message) === 'comment' && message.status === 'unread',
  );

  const onPrimaryClick = () => {
    if (isHome) {
      if (!user) {
        goto('/login');
        return;
      }
      openCompose();
      return;
    }
    goto('/');
  };

  const onMessagesClick = () => {
    if (!user) {
      goto('/login');
      return;
    }
    goto('/messages');
  };

  const onInvitesClick = () => {
    if (!user) {
      goto('/login');
      return;
    }
    goto('/invites');
  };

  const onModerationClick = () => {
    if (!user) {
      goto('/login');
      return;
    }
    goto('/moderation');
  };

  const onLegalAdminClick = () => {
    if (!user) {
      goto('/login');
      return;
    }
    goto('/admin/legal');
  };

  const onAvatarClick = () => {
    if (user) {
      goto('/me');
      return;
    }
    goto('/login');
  };
</script>

<div class="header">
  <button
    class="avatar-wrap"
    type="button"
    aria-label="用户资料"
    on:click={onAvatarClick}
  >
    <Avatar src={avatarUrl} size={36} />
  </button>
  <a class="link" href={repoUrl} target="_blank" rel="noreferrer" title="GitHub">
    <svg
      class="icon"
      viewBox="0 0 1137 1024"
      version="1.1"
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      fill="currentColor"
    >
      <path d="M0 0h1137.777778v1024H0z" fill-opacity=".01"></path>
      <path
        d="M883.939556 1024H253.838222C176.583111 1024 113.777778 964.266667 113.777778 890.823111v-399.36C113.777778 418.133333 176.583111 358.4 253.838222 358.4H290.133333A233.585778 233.585778 0 0 1 284.444444 307.2v-51.2C284.444444 114.574222 411.761778 0 568.888889 0c157.013333 0 284.444444 114.574222 284.444444 256v51.2c0 17.521778-1.991111 34.588444-5.688889 51.2h36.295112C961.137778 358.4 1024 418.133333 1024 491.52v399.303111C1024 964.266667 961.137778 1024 883.939556 1024zM512 702.805333V819.2c0 28.216889 25.486222 51.2 56.888889 51.2s56.888889-22.983111 56.888889-51.2v-116.394667c34.474667-17.635556 58.026667-50.403556 58.026666-88.405333 0-56.604444-51.484444-102.4-114.915555-102.4-63.488 0-114.915556 45.795556-114.915556 102.4 0 38.001778 23.552 70.826667 58.026667 88.405333zM739.555556 256c0-84.878222-76.401778-153.6-170.666667-153.6S398.222222 171.121778 398.222222 256v102.4h341.333334V256z"
      ></path>
    </svg>
    <div class="text">
      <span class="default-text">{userName}</span>
      <span class="hover-text ellipsis">{repoUrl}</span>
    </div>
  </a>

  <div class="menu">
    {#if searchOpen}
        <div class="search-input-wrap">
            <input
                type="text"
                placeholder="搜索..."
                bind:value={searchInput}
                on:input={onSearch}
                autofocus
            />
        </div>
        <button class="menu-btn icon-btn close-btn" type="button" on:click={toggleSearch}>
            <svg viewBox="0 0 1024 1024" width="20" height="20">
                <path d="M512 452.266667l226.133333-226.133334 59.733334 59.733334L571.733333 512l226.133334 226.133333-59.733334 59.733334L512 571.733333 285.866667 797.866667l-59.733334-59.733334L452.266667 512 226.133333 285.866667l59.733334-59.733334L512 452.266667z" fill="currentColor"></path>
            </svg>
        </button>
    {:else}
        {#if isHome}
            <button class="menu-btn icon-btn" type="button" on:click={toggleSearch}>
                <svg viewBox="0 0 1024 1024" width="20" height="20">
                    <path d="M448 768A320 320 0 1 0 448 128a320 320 0 0 0 0 640z m297.344-76.992l214.592 214.592-54.336 54.336-214.592-214.592a384 384 0 1 1 54.336-54.336z" fill="currentColor"></path>
                </svg>
            </button>
        {/if}
        <button class="menu-btn" type="button" on:click={onPrimaryClick}>
        <span>{isHome ? '发帖' : '首页'}</span>
        </button>
        <button class="menu-btn" type="button" on:click={onMessagesClick}>
        <span class="menu-label">
            <span>消息</span>
            {#if hasSystemUnread || hasLikeUnread || hasCommentUnread}
            <span class="badge">
                {#if hasSystemUnread}
                <span class="dot system"></span>
                {/if}
                {#if hasLikeUnread}
                <span class="dot like"></span>
                {/if}
                {#if hasCommentUnread}
                <span class="dot comment"></span>
                {/if}
            </span>
            {/if}
        </span>
        </button>
        {#if isAdmin}
          <button class="menu-btn" type="button" on:click={onModerationClick}>
            <span>审核</span>
          </button>
          <button class="menu-btn" type="button" on:click={onInvitesClick}>
            <span>邀请码</span>
          </button>
          <button class="menu-btn" type="button" on:click={onLegalAdminClick}>
            <span>条款</span>
          </button>
        {/if}
    {/if}
  </div>
</div>

<style>
  .header {
    position: sticky;
    top: 0;
    z-index: 9;
    display: flex;
    align-items: center;
    height: 50px;
    padding: 10px 0;
    background: #000;
  }

  .link {
    display: flex;
    flex: 1;
    align-items: center;
    overflow: hidden;
    box-sizing: border-box;
    padding: 0 20px;
    height: 30px;
    border-radius: 15px;
    background-color: #131313;
    color: #404040;
    cursor: pointer;
    text-decoration: none;
  }

  .avatar-wrap {
    margin: 0 10px;
    cursor: pointer;
    border: none;
    background: transparent;
    padding: 0;
    display: inline-flex;
    align-items: center;
  }

  .link:hover {
    color: #aaa;
  }

  .link:hover .text .default-text {
    opacity: 0;
  }

  .link:hover .text .hover-text {
    opacity: 1;
  }

  .icon {
    margin-right: 10px;
  }

  .text {
    position: relative;
    flex: 1;
    height: 15px;
  }

  .text span {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    font-weight: bold;
    font-size: 14px;
    line-height: 100%;
  }

  .hover-text {
    opacity: 0;
  }

  .menu {
    display: flex;
    justify-content: center;
    align-items: center;
    box-sizing: border-box;
    margin-left: 20px;
    padding: 0 24px;
    height: 35px;
    border: 4px solid #313131;
    background-color: #000;
    gap: 20px;
    transition: width 0.3s;
  }

  .search-input-wrap {
    flex: 1;
    height: 100%;
    min-width: 200px;
  }

  .search-input-wrap input {
    width: 100%;
    height: 100%;
    border: none;
    background: transparent;
    color: #fff;
    font-size: 14px;
    outline: none;
  }

  .icon-btn {
    width: 35px;
    padding: 0;
  }

  .close-btn {
    color: #999;
  }

  .close-btn:hover span, .close-btn:hover {
    color: #fff;
  }

  .menu-btn {
    position: relative;
    display: flex;
    justify-content: center;
    align-items: center;
    box-sizing: border-box;
    margin: 0;
    width: 80px;
    height: 100%;
    border: none;
    background: transparent;
    padding: 0;
    text-align: center;
    white-space: nowrap;
    font-size: 16px;
    cursor: pointer;
    user-select: none;
    overflow: visible;
    --hover-pad-x: 25px;
    --hover-pad-y: 8px;
    --hover-height: calc(100% + (var(--hover-pad-y) * 2));
  }

  .menu-btn::after {
    content: '';
    position: absolute;
    top: calc(var(--hover-pad-y) * -1);
    bottom: calc(var(--hover-pad-y) * -1);
    left: calc(var(--hover-pad-x) * -1);
    right: calc(var(--hover-pad-x) * -1);
    background-color: #a3c101;
    border-radius: 18px;
    transform: skewX(-18deg);
    transform-origin: center;
    opacity: 0;
    transition: opacity 0.2s;
  }

  .menu-btn:hover::after {
    opacity: 1;
    animation: button 1.5s alternate infinite;
  }

  .menu-btn span,
  .menu-btn svg {
    position: relative;
    z-index: 1;
  }

  .menu-btn span {
    color: #fff;
  }

  .menu-label {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .badge {
    display: inline-flex;
    gap: 4px;
    align-items: center;
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    display: inline-block;
    box-shadow: 0 0 6px rgba(0, 0, 0, 0.6);
  }

  .dot.system {
    background: #ffd600;
  }

  .dot.like {
    background: #20d95a;
  }

  .dot.comment {
    background: #4aa3ff;
  }

  .menu-btn:hover span,
  .menu-btn:hover svg {
    color: #000;
  }

  @keyframes button {
    0% {
      background-color: #a3c101;
      transform: skewX(-18deg) scale(1);
    }

    20% {
      transform: skewX(-18deg) scale(1.05);
    }

    40% {
      transform: skewX(-18deg) scale(1);
    }

    60% {
      transform: skewX(-18deg) scale(1.05);
    }

    80% {
      transform: skewX(-18deg) scale(1);
    }

    100% {
      background-color: #fffa00;
      transform: skewX(-18deg) scale(1.05);
    }
  }

  @media screen and (min-width: 500px) {
    .menu {
      border-radius: 20px;
    }
  }

  @media screen and (max-width: 500px) {
    .menu {
      position: fixed;
      right: 15px;
      bottom: 5px;
      border-radius: 20px 10px 10px 20px;
    }
  }
</style>
