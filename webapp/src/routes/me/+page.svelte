<script lang="ts">
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import PageShell from '$lib/components/PageShell.svelte';
  import { pb } from '$lib/api/pb';
  import { buildFileUrl } from '$lib/api/files';
  import { session, logout } from '$lib/stores/session';
  import { defaultAvatar } from '$lib/data/characters';
  import { loadMyPosts, myPosts, myPostsLoading } from '$lib/stores/myPosts';
  import { deletePost } from '$lib/api/posts';
  import { setFollow } from '$lib/api/follows';
  import { loadFollowing, following, followingLoading, removeFollowing } from '$lib/stores/follows';
  import { updateAuthorFollow } from '$lib/stores/posts';
  import { openMessage, openConfirm } from '$lib/stores/popup';
  import PopupLayer from '$lib/components/PopupLayer.svelte';
  import PostsGrid from '$lib/components/PostsGrid.svelte';
  import Avatar from '$lib/components/common/Avatar.svelte';
  import { USERNAME_MAX, USERNAME_MIN, USER_BIO_MAX, getGraphemeCount } from '$lib/validation';

  let name = '';
  let bio = '';
  let inviteCode = '';
  let avatarFile: File | null = null;
  let error = '';
  let saved = false;
  let postsError = '';
  let followError = '';

  $: if (browser && !$session) {
    goto('/login');
  }

  $: if ($session) {
    name = $session?.name ?? '';
    bio = $session?.bio ?? '';
    inviteCode = $session?.invite_code ?? '';
  }

  onMount(() => {
    void loadMyPosts();
    void loadFollowing();
  });

  const removePost = async (postId: string) => {
    openConfirm('确认删除', '确定要删除这条内容吗？此操作无法撤销。', async () => {
      postsError = '';
      try {
        await deletePost(postId);
        myPosts.update((items) => items.filter((item) => item.id !== postId));
      } catch (err) {
        const message = err instanceof Error ? err.message : '';
        switch (message) {
          case 'not_author':
            postsError = '只能删除自己的帖子。';
            break;
          case 'Missing auth token':
          case 'Invalid auth token':
          case 'Invalid auth session':
            postsError = '请先登录。';
            break;
          default:
            postsError = message || '删除失败';
        }
      }
    });
  };

  const avatarUrl = () => {
    if ($session?.avatar) {
      return buildFileUrl($session, $session.avatar) ?? defaultAvatar;
    }
    return defaultAvatar;
  };

  const onAvatarChange = (event: Event) => {
    const target = event.target as HTMLInputElement;
    avatarFile = target.files?.[0] ?? null;
  };

  const saveProfile = async () => {
    if (!$session) return;
    error = '';
    saved = false;
    try {
      const trimmedName = name.trim();
      const trimmedBio = bio.trim();
      const nameLength = getGraphemeCount(trimmedName);
      if (nameLength < USERNAME_MIN || nameLength > USERNAME_MAX) {
        error = '昵称需为 2-20 个字符。';
        return;
      }
      if (getGraphemeCount(trimmedBio) > USER_BIO_MAX) {
        error = '简介最多 100 字。';
        return;
      }
      const form = new FormData();
      form.set('name', trimmedName);
      form.set('bio', trimmedBio);
      form.set('invite_code', inviteCode.trim());
      if (avatarFile) {
        form.set('avatar', avatarFile);
      }
      const updated = await pb.collection('users').update($session.id, form);
      pb.authStore.save(pb.authStore.token, updated);
      saved = true;
    } catch (err) {
      error = '保存失败';
    }
  };

  const handleLogout = async () => {
    await logout();
    goto('/login');
  };

  const unfollowUser = async (userId: string) => {
    followError = '';
    try {
      await setFollow(userId, false);
      removeFollowing(userId);
      updateAuthorFollow(userId, false);
    } catch (err) {
      followError = '取消关注失败';
    }
  };

  let tab: 'posts' | 'profile' | 'following' = 'posts';

  const goBack = () => {
    goto('/');
  };
</script>

<PageShell>
  <div class="profile">
    <div class="header">
      <h1>个人中心</h1>
      <div class="tabs">
        <button class:active={tab === 'posts'} on:click={() => (tab = 'posts')}>我的发布</button>
        <button class:active={tab === 'following'} on:click={() => (tab = 'following')}>我的关注</button>
        <button class:active={tab === 'profile'} on:click={() => (tab = 'profile')}>资料编辑</button>
      </div>
    </div>
    {#if tab === 'posts'}
      {#if postsError}
        <div class="posts-error">{postsError}</div>
      {/if}
      <PostsGrid
        items={$myPosts}
        loading={$myPostsLoading}
        onSelect={openMessage}
        showDelete={true}
        onDelete={removePost}
        masonry={true}
      />
    {:else if tab === 'following'}
      {#if followError}
        <div class="posts-error">{followError}</div>
      {/if}
      {#if $followingLoading}
        <div class="follow-empty">加载中...</div>
      {:else if $following.length > 0}
        <div class="follow-grid">
          {#each $following as user (user.id)}
            <div class="follow-card">
              <Avatar
                class="following"
                src={user.avatarUrl ?? defaultAvatar}
                size={48}
              />
              <div class="follow-info">
                <div class="follow-name">{user.name}</div>
                <div class="follow-meta">关注中</div>
              </div>
              <button
                class="follow-remove"
                type="button"
                on:click={() => unfollowUser(user.id)}
              >
                取消关注
              </button>
            </div>
          {/each}
        </div>
      {:else}
        <div class="follow-empty">还没有关注的人</div>
      {/if}
    {:else}
      <div class="profile-card">
        <div class="avatar-block">
          <img src={avatarUrl()} alt="" />
          <input type="file" accept="image/*" on:change={onAvatarChange} />
        </div>
        <label>
          昵称（2-20字）
          <input type="text" bind:value={name} minlength={USERNAME_MIN} maxlength={USERNAME_MAX} />
        </label>
        <label>
          简介（100字内）
          <textarea rows="4" bind:value={bio} maxlength={USER_BIO_MAX}></textarea>
        </label>
        <label>
          邀请码
          <input type="text" bind:value={inviteCode} placeholder="可选" />
        </label>
        {#if error}
          <div class="error">{error}</div>
        {/if}
        {#if saved}
          <div class="saved">已保存</div>
        {/if}
        <div class="actions">
          <button class="secondary" type="button" on:click={handleLogout}>退出登录</button>
          <button class="primary" type="button" on:click={saveProfile}>保存</button>
        </div>
      </div>
    {/if}
  </div>
</PageShell>
<PopupLayer />

<style>
  .profile {
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

  .profile-card {
    width: min(640px, 100%);
    background: #0b0b0b;
    border: 2px solid #1f1f1f;
    border-radius: 18px;
    padding: 22px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  h1 {
    margin: 0;
    font-size: 24px;
  }


  .avatar-block {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .avatar-block img {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    border: 3px solid #1f1f1f;
    object-fit: cover;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 14px;
    color: #cfcfcf;
  }

  input,
  textarea {
    background: #111;
    border: 2px solid #2a2a2a;
    border-radius: 12px;
    color: #fff;
    padding: 10px 12px;
  }

  .actions {
    display: flex;
    justify-content: space-between;
    gap: 10px;
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

  .avatar-block {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
  }

  .avatar-block input[type='file'] {
    max-width: 100%;
    width: 100%;
    flex: 1 1 180px;
  }

  .primary {
    border: none;
    border-radius: 12px;
    padding: 10px 16px;
    background: #a3c101;
    color: #000;
    cursor: pointer;
  }

  .secondary {
    border: none;
    border-radius: 12px;
    padding: 10px 16px;
    background: #1f1f1f;
    color: #fff;
    cursor: pointer;
  }

  .error {
    color: #ff7b7b;
  }

  .saved {
    color: #a3c101;
  }

  .posts-error {
    color: #ff7b7b;
    margin-bottom: 8px;
  }

  .follow-grid {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: min(640px, 100%);
  }

  .follow-card {
    display: flex;
    align-items: center;
    gap: 12px;
    background: #0b0b0b;
    border: 2px solid #1f1f1f;
    border-radius: 16px;
    padding: 12px 16px;
  }

  .follow-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .follow-name {
    color: #fff;
    font-size: 16px;
  }

  .follow-meta {
    color: #6b6b6b;
    font-size: 12px;
  }

  .follow-remove {
    margin-left: auto;
    border: none;
    border-radius: 999px;
    padding: 6px 12px;
    background: #2b2b2b;
    color: #d0d0d0;
    cursor: pointer;
  }

  .follow-remove:hover {
    background: #c23a2b;
    color: #fff;
  }

  .follow-empty {
    color: #666;
    text-align: center;
    padding: 40px 0;
  }
</style>
