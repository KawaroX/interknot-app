<script lang="ts">
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { goto } from '$app/navigation';
  import Window from '$lib/components/common/Window.svelte';
  import Avatar from '$lib/components/common/Avatar.svelte';
  import Level from '$lib/components/common/Level.svelte';
  import { ApiError, createPost, updatePost } from '$lib/api/posts';
  import { buildFileUrl } from '$lib/api/files';
  import { pb } from '$lib/api/pb';
  import { defaultAvatar } from '$lib/data/characters';
  import { loadPosts } from '$lib/stores/posts';
  import { loadMyPosts } from '$lib/stores/myPosts';
  import { closePopup } from '$lib/stores/popup';
  import { session } from '$lib/stores/session';
  import RateLimitAlert from '$lib/components/common/RateLimitAlert.svelte';
  import type { PostSummary } from '$lib/types';
  import {
    POST_BODY_MAX,
    POST_COVER_MAX_BYTES,
    POST_TITLE_MAX_UNITS,
    getGraphemeCount,
    getTitleUnits,
  } from '$lib/validation';

  export let post: PostSummary | null = null;

  let title = '';
  let body = '';
  let tags: string[] = [];
  let tagInput = '';
  let coverFile: File | null = null;
  let coverPreview: string | null = null;
  let fileInput: HTMLInputElement | null = null;
  let submitting = false;
  let error = '';
  let initialized = false;
  let isEdit = false;
  let rateLimitError: { message: string; retryAfter: number } | null = null;
  let coverChangeId = 0;
  let isDragActive = false;
  let dragCounter = 0;
  let isClipboardLoading = false;
  let clipboardSupported = true;

  const coverLimitMb = Math.ceil(POST_COVER_MAX_BYTES / (1024 * 1024));
  const coverMaxDimension = 1600;
  const coverQualitySteps = [0.85, 0.75, 0.65];


  onMount(() => {
    clipboardSupported = !!navigator.clipboard?.read;
  });

  $: isEdit = Boolean(post);
  $: titleUnits = getTitleUnits(title.trim());
  $: bodyLength = getGraphemeCount(body.trim());
  $: titleOverLimit = titleUnits > POST_TITLE_MAX_UNITS;
  $: bodyOverLimit = bodyLength > POST_BODY_MAX;

  $: user = $session;
  $: avatarUrl = user?.avatar
    ? buildFileUrl(user, user.avatar) ?? defaultAvatar
    : defaultAvatar;
  $: userName = user?.name ?? '匿名';
  $: userLevel = user?.level ?? undefined;

  const createCanvasBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

  const compressCoverFile = async (file: File) => {
    if (!file.type.startsWith('image/')) return file;
    if (file.size <= POST_COVER_MAX_BYTES) return file;

    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, coverMaxDimension / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        bitmap.close?.();
        return file;
      }
      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close?.();

      const shouldConvert =
        file.type === 'image/heic' ||
        file.type === 'image/heif' ||
        file.size > POST_COVER_MAX_BYTES;
      const outputType = shouldConvert ? 'image/jpeg' : file.type || 'image/jpeg';
      const outputName = shouldConvert
        ? file.name.replace(/\.[^/.]+$/, '.jpg')
        : file.name;
      const qualitySteps = outputType === 'image/png' ? [1] : coverQualitySteps;

      let bestFile: File | null = null;
      for (const quality of qualitySteps) {
        const blob = await createCanvasBlob(canvas, outputType, quality);
        if (!blob) continue;
        const candidate = new File([blob], outputName, { type: outputType });
        bestFile = candidate;
        if (candidate.size <= POST_COVER_MAX_BYTES) return candidate;
      }

      return bestFile ?? file;
    } catch {
      return file;
    }
  };

  const resetDragState = () => {
    dragCounter = 0;
    isDragActive = false;
  };

  const applyCoverFile = async (selectedFile: File) => {
    const changeId = ++coverChangeId;
    const previousPreview = coverPreview;
    const previousFile = coverFile;
    const compressed = await compressCoverFile(selectedFile);
    if (changeId !== coverChangeId) return;
    if (compressed.size > POST_COVER_MAX_BYTES) {
      alert(`封面图片过大，请控制在 ${coverLimitMb}MB 以内。`);
      coverPreview = previousPreview;
      coverFile = previousFile;
      return;
    }
    if (previousPreview?.startsWith('blob:')) {
      URL.revokeObjectURL(previousPreview);
    }
    coverFile = compressed;
    coverPreview = URL.createObjectURL(compressed);
  };

  const onFileChange = async (event: Event) => {
    const target = event.target as HTMLInputElement;
    const selectedFile = target.files?.[0] ?? null;
    if (!selectedFile) {
      target.value = '';
      return;
    }
    await applyCoverFile(selectedFile);
    target.value = '';
  };

  const onImageClick = () => {
    fileInput?.click();
  };

  const onDragEnter = (event: DragEvent) => {
    event.preventDefault();
    dragCounter += 1;
    isDragActive = true;
  };

  const onDragLeave = (event: DragEvent) => {
    event.preventDefault();
    dragCounter = Math.max(0, dragCounter - 1);
    if (dragCounter === 0) {
      isDragActive = false;
    }
  };

  const onDragOver = (event: DragEvent) => {
    event.preventDefault();
  };

  const onDrop = async (event: DragEvent) => {
    event.preventDefault();
    resetDragState();
    const itemFile = event.dataTransfer?.items?.[0]?.getAsFile() ?? null;
    const droppedFile = itemFile ?? event.dataTransfer?.files?.[0] ?? null;
    if (!droppedFile) return;
    if (!droppedFile.type.startsWith('image/')) {
      alert('请拖拽图片文件。');
      return;
    }
    await applyCoverFile(droppedFile);
  };

  const onClipboardClick = async () => {
    if (isClipboardLoading) return;
    if (!navigator.clipboard?.read) {
      alert('当前浏览器不支持读取剪贴板图片。');
      return;
    }
    isClipboardLoading = true;
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((type) => type.startsWith('image/'));
        if (!imageType) continue;
        const blob = await item.getType(imageType);
        const extension = imageType.split('/')[1] ?? 'png';
        const file = new File([blob], `clipboard.${extension}`, { type: imageType });
        await applyCoverFile(file);
        return;
      }
      alert('剪贴板中没有图片。');
    } catch {
      alert('读取剪贴板失败，请检查浏览器权限。');
    } finally {
      isClipboardLoading = false;
    }
  };

  const addTag = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const val = tagInput.trim();
      if (val && !tags.includes(val) && tags.length < 10) {
        tags = [...tags, val];
        tagInput = '';
      }
    }
  };

  const removeTag = (tag: string) => {
    tags = tags.filter((t) => t !== tag);
  };

  const mapError = (message: string) => {
    switch (message) {
      case 'invite_required':
        return '需要邀请码才能发言。';
      case 'invite_invalid':
        return '邀请码无效。';
      case 'invite_in_use':
        return '邀请码已被使用。';
      case 'can_post_disabled':
        return '当前账号已被禁止发言。';
      case 'title_too_long':
        return '标题最多 20 个汉字或 40 个英文字符。';
      case 'body_too_long':
        return '正文最多 2000 字。';
      case 'cover_too_large':
        return `封面图片过大，请控制在 ${coverLimitMb}MB 以内。`;
      case 'cover_invalid':
        return '封面图片格式不支持，请更换为常见图片格式。';
      case 'not_author':
        return '只能编辑自己的帖子。';
      default:
        return '发布失败，请稍后重试。';
    }
  };

  const submit = async () => {
    if (!pb.authStore.isValid) {
      closePopup();
      goto('/login');
      return;
    }
    error = '';
    rateLimitError = null;
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (!trimmedTitle || !trimmedBody) {
      alert('请填写标题与内容。');
      return;
    }
    if (getTitleUnits(trimmedTitle) > POST_TITLE_MAX_UNITS) {
      alert('标题最多 20 个汉字或 40 个英文字符。');
      return;
    }
    if (getGraphemeCount(trimmedBody) > POST_BODY_MAX) {
      alert('正文最多 2000 字。');
      return;
    }
    if (coverFile && coverFile.size > POST_COVER_MAX_BYTES) {
      alert(`封面图片过大，请控制在 ${coverLimitMb}MB 以内。`);
      return;
    }
    submitting = true;
    try {
      const form = new FormData();
      form.set('title', trimmedTitle);
      form.set('body', trimmedBody);
      form.set('tags', JSON.stringify(tags));
      if (coverFile) {
        form.set('cover', coverFile);
      }
      if (isEdit && post) {
        await updatePost(post.id, form);
      } else {
        await createPost(form);
      }
      await loadPosts();
      if (isEdit) {
        await loadMyPosts();
      }
      closePopup();
    } catch (err) {
      if (err instanceof ApiError && err.code === 429) {
        rateLimitError = {
          message: err.detail ?? '发布过于频繁，请稍后再试。',
          retryAfter: err.retryAfter ?? 0,
        };
        return;
      }
      const message =
        err instanceof ApiError
          ? err.reason ?? err.message
          : err instanceof Error
            ? err.message
            : '';
      alert(mapError(message));
    } finally {
      submitting = false;
    }
  };

  $: if (post && !initialized) {
    title = post.title ?? '';
    body = post.body ?? '';
    tags = Array.isArray(post.tags) ? [...post.tags] : [];
    coverPreview = post.coverUrl ?? null;
    initialized = true;
  }
</script>

<div class="popup-shell" transition:fade={{ duration: 100 }}>
  <Window
    variant="compose-window"
    title={isEdit ? '编辑帖子' : '发帖'}
    onClose={closePopup}
  >
    <svelte:fragment slot="header">
      <div class="user">
        <Avatar src={avatarUrl} size={40} />
        <div class="name">
          <span>{userName}</span>
          <Level level={userLevel} />
        </div>
      </div>
    </svelte:fragment>
    <div class="compose">
      <div class="left-col">
        <button
          class="image"
          type="button"
          class:dragging={isDragActive}
          on:click={onImageClick}
          on:dragenter={onDragEnter}
          on:dragleave={onDragLeave}
          on:dragover={onDragOver}
          on:drop={onDrop}
          on:dragend={resetDragState}
        >
          <img src={coverPreview ?? '/images/empty.webp'} alt="" />
          {#if !coverPreview || isDragActive}
            <div class="upload-hint" class:drag={isDragActive}>
              {isDragActive ? '松开上传' : '点击或拖拽上传'}
            </div>
          {/if}
        </button>
        <input
          class="file-input"
          type="file"
          accept="image/*"
          bind:this={fileInput}
          on:change={onFileChange}
        />
        <button
          class="clipboard-btn"
          type="button"
          on:click={onClipboardClick}
          disabled={isClipboardLoading || !clipboardSupported}
          title={clipboardSupported ? '从剪贴板读取图片' : '浏览器不支持剪贴板读取'}
        >
          <span>{isClipboardLoading ? '读取中...' : '粘贴封面'}</span>
        </button>
      </div>
      
      <div class="message">
        <div class="input-group">
            <input
                class="title-input"
                type="text"
                placeholder="标题（20字/40英文）"
                bind:value={title}
            />
            <div class="counter" class:overlimit={titleOverLimit}>
                {titleUnits}/{POST_TITLE_MAX_UNITS}
            </div>
        </div>

        <div class="input-group tag-group">
            <div class="tag-list">
                {#each tags as tag}
                    <button class="tag-chip" on:click={() => removeTag(tag)}>#{tag} ×</button>
                {/each}
                <input
                    class="tag-input"
                    type="text"
                    placeholder={tags.length === 0 ? "添加标签 (回车)" : "+"}
                    bind:value={tagInput}
                    on:keydown={addTag}
                    disabled={tags.length >= 10}
                />
            </div>
        </div>
        
        <div class="input-group body-group">
            <textarea
                class="body-input"
                placeholder="正文（2000字内）"
                bind:value={body}
            ></textarea>
            <div class="counter" class:overlimit={bodyOverLimit}>
                {bodyLength}/{POST_BODY_MAX}
            </div>
        </div>
      </div>
    </div>
    <svelte:fragment slot="footer">
      <div class="actions">
        <div class="actions-bar">
          <button type="button" class="action-btn cancel" on:click={closePopup}>
            <span>取消</span>
          </button>
          <button
            type="button"
            class="action-btn primary"
            on:click={submit}
            disabled={submitting}
          >
            <span>{submitting ? '提交中...' : isEdit ? '保存' : '发布'}</span>
          </button>
        </div>
      </div>
    </svelte:fragment>
  </Window>
  {#if rateLimitError}
    <RateLimitAlert 
      title="发送失败" 
      message={rateLimitError.message} 
      retryAfter={rateLimitError.retryAfter}
      onClose={() => rateLimitError = null} 
    />
  {/if}
</div>

<style>
  .compose {
    display: flex;
    gap: 20px;
    width: 100%;
    height: 100%;
    min-height: 0;
    color: #e6e6e6;
  }

  .user {
    display: flex;
    align-items: center;
  }

  .name {
    display: flex;
    flex-direction: column;
    margin-left: 10px;
  }

  .name span {
    height: 20px;
    color: #a1a0a1;
    font-size: 18px;
  }

  .left-col {
    display: flex;
    flex-direction: column;
    width: 30%;
    max-width: 200px;
    gap: 12px;
  }

  .image {
    display: flex;
    justify-content: center;
    align-items: center;
    position: relative;
    overflow: hidden;
    box-sizing: border-box;
    width: 100%;
    aspect-ratio: 3 / 4;
    border: 3px solid rgba(100, 100, 100, 0.5);
    border-radius: 20px;
    background: transparent;
    padding: 0;
    cursor: pointer;
    appearance: none;
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  .image.dragging {
    border-color: rgba(163, 193, 1, 0.8);
    box-shadow: 0 0 0 4px rgba(163, 193, 1, 0.2);
  }

  .image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .upload-hint {
    position: absolute;
    bottom: 0;
    width: 100%;
    background: rgba(0, 0, 0, 0.6);
    color: #fff;
    font-size: 12px;
    padding: 4px 0;
    text-align: center;
  }

  .upload-hint.drag {
    background: rgba(163, 193, 1, 0.9);
    color: #000;
  }

  .file-input {
    display: none;
  }

  .clipboard-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    padding: 8px 12px;
    border: 2px dashed rgba(100, 100, 100, 0.6);
    border-radius: 12px;
    background: #0f0f0f;
    color: #cfcfcf;
    font-size: 12px;
    cursor: pointer;
    transition: border-color 0.2s, color 0.2s, background 0.2s;
  }

  .clipboard-btn:hover {
    border-color: rgba(163, 193, 1, 0.8);
    color: #fff;
  }

  .clipboard-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .message {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 12px;
    padding: 20px;
    border-radius: 20px;
    background: #000;
    overflow: hidden; /* Ensure content doesn't spill out */
    min-height: 0;
    min-width: 0;
  }

  .input-group {
    position: relative;
    width: 100%;
  }

  .title-input {
    width: 100%;
    height: 40px;
    padding: 0 10px;
    border: none;
    border-radius: 8px;
    background: #0f0f0f;
    color: #fff;
    font-size: 16px;
    font-weight: bold;
    outline: none;
    box-sizing: border-box;
  }

  .tag-group {
    min-height: 32px;
  }

  .tag-list {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    min-height: 32px;
    padding: 4px 8px;
    border-radius: 8px;
    background: #0f0f0f;
  }

  .tag-chip {
    display: flex;
    align-items: center;
    padding: 2px 6px;
    border: none;
    border-radius: 4px;
    background: rgba(163, 193, 1, 0.2);
    color: #a3c101;
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
  }

  .tag-chip:hover {
    background: rgba(163, 193, 1, 0.3);
  }

  .tag-input {
    flex: 1;
    min-width: 60px;
    background: transparent;
    border: none;
    color: #ccc;
    font-size: 12px;
    outline: none;
  }

  .body-group {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
  }

  .body-input {
    flex: 1;
    width: 100%;
    height: 100%;
    min-height: 0;
    padding: 10px;
    border: none;
    border-radius: 8px;
    background: #0f0f0f;
    color: #fff;
    font-size: 14px;
    line-height: 1.6;
    outline: none;
    resize: none;
    box-sizing: border-box;
    overflow-y: auto;
    font-weight: normal;
  }

  .counter {
    position: absolute;
    right: 10px;
    bottom: 5px;
    font-size: 10px;
    color: #666;
    pointer-events: none;
  }

  .body-group .counter {
    bottom: 10px;
    right: 20px; /* Adjust for scrollbar */
    background: rgba(0,0,0,0.5);
    padding: 2px 4px;
    border-radius: 4px;
  }

  .counter.overlimit {
    color: #ff7b7b;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    width: 100%;
    padding: 10px 20px 20px;
  }

  .actions-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    height: 38px;
    padding: 0 12px;
    border: 4px solid #313131;
    border-radius: 999px;
    background: #000;
  }

  .action-btn {
    position: relative;
    border: none;
    background: transparent;
    padding: 0 18px;
    height: 36px;
    cursor: pointer;
    color: #fff;
    font-size: 14px;
    overflow: visible;
    --accent-start: #a3c101;
    --accent-end: #fffa00;
    --text-hover: #000;
  }

  .action-btn.cancel {
    color: #b5b5b5;
    --accent-start: #c23a2b;
    --accent-end: #ff5d5d;
    --text-hover: #fff;
  }

  .action-btn::after {
    content: '';
    position: absolute;
    top: -6px;
    bottom: -6px;
    left: -20px;
    right: -20px;
    background-color: var(--accent-start);
    border-radius: 18px;
    transform: skewX(-18deg);
    transform-origin: center;
    opacity: 0;
    transition: opacity 0.2s;
    z-index: 0;
  }

  .action-btn:hover::after {
    opacity: 1;
    animation: buttonPulse 1.5s alternate infinite;
  }

  .action-btn span,
  .action-btn {
    position: relative;
    z-index: 1;
  }

  .action-btn:hover {
    color: var(--text-hover);
  }

  @keyframes buttonPulse {
    0% {
      background-color: var(--accent-start);
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
      background-color: var(--accent-end);
      transform: skewX(-18deg) scale(1.05);
    }
  }

  @media screen and (max-width: 600px) {
    .compose {
      flex-direction: column;
      height: auto;
      max-height: 60vh;
      overflow-y: auto;
    }
    
    .left-col {
      width: 100%;
      max-width: none;
      flex-direction: column;
      align-items: center;
    }

    .image {
      width: 120px;
    }

    .clipboard-btn {
      width: 120px;
    }

    .body-input {
      min-height: 150px;
    }
  }
</style>
