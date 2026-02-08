<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import { goto } from "$app/navigation";
    import type { PostSummary } from "$lib/types";
    import { defaultAvatar } from "$lib/data/characters";
    import { buildThumbUrl } from "$lib/api/files";
    import { pb } from "$lib/api/pb";
    import { setFollow } from "$lib/api/follows";
    import { toggleLike } from "$lib/api/posts";
    import { showToast } from "$lib/stores/toast";
    import {
        loadPosts,
        searchQuery,
        updateAuthorFollow,
        updatePostLike,
    } from "$lib/stores/posts";
    import { addFollowing, removeFollowing } from "$lib/stores/follows";
    import {
        send,
        selectedCardId,
        setSelectedCard,
    } from "$lib/stores/cardTransition";
    import { openContextMenu } from "$lib/stores/contextMenu";
    import { requestPostReport } from "$lib/stores/report";

    export let post: PostSummary;
    export let showDelete = false;

    $: isSelected = $selectedCardId === post.id;

    const dispatch = createEventDispatcher<{
        select: string;
        delete: string;
    }>();

    const highlight = (text: string, term: string) => {
        if (!term || !text) return text;
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(`(${escaped})`, "gi");
        return text.replace(regex, '<span class="highlight">$1</span>');
    };

    $: bodyText = post.body ?? "";
    $: coverThumbUrl =
        buildThumbUrl(post.coverUrl, "720x0") ?? post.coverUrl ?? "/images/empty.webp";
    $: titleHtml = highlight(post.title, $searchQuery);
    $: previewHtml = highlight(bodyText.split("\n")[0], $searchQuery);

    const handleSelect = () => {
        setSelectedCard(post.id);
        dispatch("select", post.id);
    };

    const handleTagClick = (tag: string) => {
        void loadPosts(tag);
    };

    const handleDelete = () => {
        dispatch("delete", post.id);
    };

    const ensureAuth = () => {
        if (!pb.authStore.isValid) {
            void goto("/login");
            return false;
        }
        return true;
    };

    const buildShareUrl = () => {
        const url = new URL("/", window.location.origin);
        url.searchParams.set("post", post.id);
        return url.toString();
    };

    const copyShareUrl = async () => {
        try {
            await navigator.clipboard.writeText(buildShareUrl());
            showToast("已复制链接");
        } catch (err) {
            showToast("复制失败");
        }
    };

    const toggleFollow = async () => {
        if (!ensureAuth()) return;
        const nextFollow = !post.authorFollowedByViewer;
        try {
            const result = await setFollow(post.author.id, nextFollow);
            updateAuthorFollow(post.author.id, result.following);
            if (result.following) {
                addFollowing({
                    ...post.author,
                    followedAt: new Date().toISOString(),
                });
            } else {
                removeFollowing(post.author.id);
            }
        } catch (err) {
            showToast("关注失败");
        }
    };

    const togglePostLike = async () => {
        if (!ensureAuth()) return;
        try {
            const result = await toggleLike(post.id);
            updatePostLike(post.id, result.liked, result.likeCount);
        } catch (err) {
            showToast("点赞失败");
        }
    };

    const handleContextMenu = (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        const isSelf = pb.authStore.model?.id === post.author.id;
        openContextMenu({
            x: event.clientX,
            y: event.clientY,
            items: [
                { label: "打开", action: handleSelect },
                {
                    label: post.authorFollowedByViewer ? "取消关注" : "关注",
                    action: toggleFollow,
                    disabled: isSelf,
                },
                {
                    label: post.likedByViewer ? "取消点赞" : "点赞",
                    action: togglePostLike,
                },
                {
                    label: "举报",
                    action: () => {
                        requestPostReport(post.id);
                        handleSelect();
                    },
                    danger: true,
                },
                { label: "复制链接", action: copyShareUrl },
            ],
        });
    };

    const handleKeydown = (event: KeyboardEvent) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleSelect();
        }
    };

    $: preview = bodyText.split("\n")[0];
</script>

<div
    class="card"
    class:unread={post.authorFollowedByViewer && !post.readByViewer}
    role="button"
    tabindex="0"
    on:click={handleSelect}
    on:keydown={handleKeydown}
    on:contextmenu={handleContextMenu}
>
    <div class="image">
        <!-- 始终存在的占位图片，保持布局稳定 -->
        <img
            class="image-placeholder"
            src={coverThumbUrl}
            alt=""
        />
        <!-- 动画图片层 -->
        {#if !isSelected}
            <div class="image-inner" out:send={{ key: post.id }}>
                <img src={coverThumbUrl} alt="" />
            </div>
        {/if}
        <div class="view">
            <div class="stat" class:read={post.readByViewer}>
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 512 512"
                >
                    <circle cx="256" cy="256" r="64" fill="currentColor"
                    ></circle>
                    <path
                        d="M490.84 238.6c-26.46-40.92-60.79-75.68-99.27-100.53C349 110.55 302 96 255.66 96c-42.52 0-84.33 12.15-124.27 36.11c-40.73 24.43-77.63 60.12-109.68 106.07a31.92 31.92 0 0 0-.64 35.54c26.41 41.33 60.4 76.14 98.28 100.65C162 402 207.9 416 255.66 416c46.71 0 93.81-14.43 136.2-41.72c38.46-24.77 72.72-59.66 99.08-100.92a32.2 32.2 0 0 0-.1-34.76zM256 352a96 96 0 1 1 96-96a96.11 96.11 0 0 1-96 96z"
                        fill="currentColor"
                    ></path>
                </svg>
                <span>{post.viewCount}</span>
            </div>
            <div class="stat like-stat" class:liked={post.likedByViewer}>
                {#if post.likedByViewer}
                    <svg viewBox="0 0 122.88 106.16" width="18" height="18">
                        <path
                            fill="currentColor"
                            fill-rule="evenodd"
                            clip-rule="evenodd"
                            d="M4.02 44.6h27.36c2.21 0 4.02 1.81 4.02 4.03v53.51c0 2.21-1.81 4.03-4.02 4.03H4.02c-2.21 0-4.02-1.81-4.02-4.03V48.63c0-2.22 1.81-4.03 4.02-4.03zM63.06 4.46c2.12-10.75 19.72-.85 20.88 16.48.35 5.3-.2 11.47-1.5 18.36h25.15c10.46.41 19.59 7.9 13.14 20.2 1.47 5.36 1.69 11.65-2.3 14.13.5 8.46-1.84 13.7-6.22 17.84-.29 4.23-1.19 7.99-3.23 10.88-3.38 4.77-6.12 3.63-11.44 3.63H55.07c-6.73 0-10.4-1.85-14.8-7.37V51.31c12.66-3.42 19.39-20.74 22.79-32.11V4.46z"
                        />
                    </svg>
                {:else}
                    <svg viewBox="0 0 122.88 104.19" width="18" height="18">
                        <path
                            fill="currentColor"
                            d="M62.63 6.25c.56-2.85 2.03-4.68 4.04-5.61 1.63-.76 3.54-.83 5.52-.31 1.72.45 3.53 1.37 5.26 2.69 4.69 3.57 9.08 10.3 9.64 18.71.17 2.59.12 5.35-.12 8.29-.16 1.94-.41 3.98-.75 6.1h19.95l.09.01c3.24.13 6.38.92 9.03 2.3 2.29 1.2 4.22 2.84 5.56 4.88 1.38 2.1 2.13 4.6 2.02 7.46-.08 2.12-.65 4.42-1.81 6.87.66 2.76.97 5.72.54 8.32-.36 2.21-1.22 4.17-2.76 5.63.08 3.65-.41 6.71-1.39 9.36-1.01 2.72-2.52 4.98-4.46 6.98-.17 1.75-.45 3.42-.89 4.98-.55 1.96-1.36 3.76-2.49 5.35h0c-3.4 4.8-6.12 4.69-10.43 4.51-.6-.02-1.24-.05-2.24-.05H58.58c-3.51 0-6.27-.51-8.79-1.77-2.49-1.25-4.62-3.17-6.89-6.01l-.58-1.66V47.78l1.98-.53c5.03-1.36 8.99-5.66 12.07-10.81 3.16-5.3 5.38-11.5 6.9-16.51V6.76l.06-.51zM4 43.02h29.08c2.2 0 4 1.8 4 4v53.17c0 2.2-1.8 4-4 4H4c-2.2 0-4-1.8-4-4V47.02c0-2.2 1.8-4 4-4zm64.9-37.54c-.43.2-.78.7-.99 1.56V20.3l-.12.76c-1.61 5.37-4.01 12.17-7.55 18.1-3.33 5.57-7.65 10.36-13.27 12.57v40.61c1.54 1.83 2.96 3.07 4.52 3.85 1.72.86 3.74 1.2 6.42 1.2h39.03c.7 0 1.6.04 2.45.07 2.56.1 4.17.17 5.9-2.27v-.01c.75-1.06 1.3-2.31 1.69-3.71.42-1.49.67-3.15.79-4.92l.82-1.75c1.72-1.63 3.03-3.46 3.87-5.71.86-2.32 1.23-5.11 1.02-8.61l-.09-1.58 1.34-.83c.92-.57 1.42-1.65 1.63-2.97.34-2.1-.02-4.67-.67-7.06l.21-1.93c1.08-2.07 1.6-3.92 1.67-5.54.06-1.68-.37-3.14-1.17-4.35-.84-1.27-2.07-2.31-3.56-3.09-1.92-1.01-4.24-1.59-6.66-1.69v.01H79.83l.59-3.15c.57-3.05.98-5.96 1.22-8.72.23-2.7.27-5.21.12-7.49-.45-6.72-3.89-12.04-7.56-14.83-1.17-.89-2.33-1.5-3.38-1.77-1.28-.33-1.94-.34-2.42-.12z"
                        />
                    </svg>
                {/if}
                <span>{post.likeCount}</span>
            </div>
        </div>
    </div>
    <div class="content">
        <div class="user">
            <div class="avatar" class:following={post.authorFollowedByViewer}>
                <img src={post.author.avatarUrl ?? defaultAvatar} alt="" />
            </div>
            <span class="ellipsis">{post.author.name ?? "匿名"}</span>
        </div>
        <div class="title">
            {#if post.isHot}
                <span class="hot-badge">HOT</span>
            {/if}
            <span class="title-text">{@html titleHtml}</span>
        </div>
        {#if post.tags && post.tags.length > 0}
            <div class="tags">
                {#each post.tags as tag}
                    <button
                        class="tag"
                        on:click|stopPropagation={() => handleTagClick(tag)}
                        >#{tag}</button
                    >
                {/each}
            </div>
        {/if}
        <div class="text ellipsis">{@html previewHtml}</div>
    </div>
    {#if showDelete}
        <button
            class="del"
            type="button"
            aria-label="删除"
            on:click|stopPropagation={handleDelete}
        >
            <svg viewBox="0 0 1024 1024" width="20" height="20">
                <path
                    d="M328.777143 377.904762l31.719619 449.657905h310.662095l31.695238-449.657905h73.264762L744.106667 832.707048a73.142857 73.142857 0 0 1-72.94781 67.998476H360.496762a73.142857 73.142857 0 0 1-72.94781-68.022857L255.488 377.904762h73.289143z m159.207619 22.649905v341.333333h-73.142857v-341.333333h73.142857z m133.729524 0v341.333333h-73.142857v-341.333333h73.142857zM146.285714 256h731.428572v73.142857H146.285714v-73.142857z m518.265905-121.904762v73.142857h-292.571429v-73.142857h292.571429z"
                    fill="currentColor"
                ></path>
            </svg>
        </button>
    {/if}
</div>

<style>
    .card {
        position: relative;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border-radius: 20px 20px 5px 20px;
        background-color: #222;
        cursor: pointer;
        transition:
            transform 0.25s cubic-bezier(0.22, 1, 0.36, 1),
            border-color 0.3s,
            box-shadow 0.3s;
        padding: 0;
        text-align: left;
        border: 4px solid #000;
        margin: 1px;
        will-change: transform;
    }

    .card.unread {
        box-shadow: 0 0 0 3px rgba(80, 150, 255, 0.9);
    }

    .card.unread:hover {
        animation: cardBorderShiftUnread 1.5s alternate infinite;
    }

    .card:hover {
        border-color: #a3c101;
        animation: cardBorderShift 1.5s alternate infinite;
        will-change: transform, box-shadow, border-color;
        transform: translateY(-4px) scale(1.02);
    }

    .card:hover .del {
        opacity: 1;
        pointer-events: auto;
    }

    .image {
        position: relative;
        overflow: hidden;
        width: 100%;
        background: #333;
    }

    /* 占位图片 - 始终存在，撑起容器高度 */
    .image-placeholder {
        display: block;
        width: 100%;
        object-fit: cover;
        visibility: hidden;
    }

    /* 动画图片层 - 绝对定位覆盖在占位图上 */
    .image-inner {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
    }

    .image-inner img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 0.4s cubic-bezier(0.22, 1, 0.36, 1);
    }

    .card:hover .image-inner img {
        transform: scale(1.08);
    }

    .view {
        position: absolute;
        top: 8px;
        left: 10px;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 6px;
        color: #fff;
        filter: drop-shadow(0 2px 6px rgba(20, 20, 20, 0.75));
    }

    .stat {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        opacity: 0.8;
    }

    .stat span {
        font-weight: bold;
        font-size: 14px;
    }

    .stat.liked {
        color: #a3c101;
    }

    .stat.read {
        opacity: 0.5;
    }

    .like-stat svg {
        transform: translateY(-1px);
    }

    .content {
        padding: 8px 10px 10px;
    }

    .user {
        position: relative;
    }

    .user .avatar {
        position: absolute;
        bottom: 0;
        left: 0;
        width: 50px;
        height: 50px;
        border: 3px solid #222;
        border-radius: 50%;
        background-color: #a1a0a1;
    }

    .user .avatar.following {
        border-color: #2fbf5b;
    }

    .user .avatar img {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        object-fit: contain;
    }

    .user span {
        display: block;
        margin-left: 60px;
        padding-bottom: 6px;
        width: calc(100% - 60px);
        border-bottom: 2px solid rgba(90, 90, 90, 0.5);
        color: #989898;
        font-size: 14px;
        transform: translateY(-2px);
    }

    .title {
        display: flex;
        align-items: center;
        gap: 6px;
        margin: 5px 0;
        color: #fff;
        font-size: 18px;
    }

    .hot-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 2px 6px;
        border-radius: 6px;
        background: #8a3a3a;
        color: #140600;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.4px;
    }

    .tags {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 8px;
    }

    .tag {
        background: rgba(163, 193, 1, 0.15);
        color: #a3c101;
        border: none;
        border-radius: 4px;
        padding: 2px 6px;
        font-size: 12px;
        cursor: pointer;
        transition: all 0.2s;
    }

    .tag:hover {
        background: rgba(163, 193, 1, 0.3);
    }

    .text {
        color: #8f8f8f;
        font-size: 14px;
        font-weight: normal;
    }

    .card :global(.highlight) {
        color: #4aa3ff;
        font-weight: bold;
    }

    .del {
        position: absolute;
        top: -15px;
        right: -15px;
        display: flex;
        justify-content: center;
        align-items: center;
        width: 50px;
        height: 50px;
        border-radius: 50%;
        background-color: #000;
        border: none;
        padding: 0;
        color: #fff;
        opacity: 0;
        pointer-events: none;
        transition: 0.3s;
        cursor: pointer;
    }

    .del svg {
        margin: 10px 12.5px 0 0;
    }

    @keyframes cardBorderShift {
        0% {
            border-color: #a3c101;
            box-shadow: 0 0 0 0 #a3c101;
        }

        20% {
            box-shadow: 0 0 0 1.5px #a3c101;
        }

        40% {
            box-shadow: 0 0 0 0 #a3c101;
        }

        60% {
            box-shadow: 0 0 0 1.5px #a3c101;
        }

        80% {
            box-shadow: 0 0 0 0 #a3c101;
        }

        100% {
            border-color: #fffa00;
            box-shadow: 0 0 0 1.5px #fffa00;
        }
    }

    @keyframes cardBorderShiftUnread {
        0% {
            border-color: #a3c101;
            box-shadow:
                0 0 0 3px rgba(80, 150, 255, 0.9),
                0 0 0 0 #a3c101;
        }

        20% {
            box-shadow:
                0 0 0 3px rgba(80, 150, 255, 0.9),
                0 0 0 1.5px #a3c101;
        }

        40% {
            box-shadow:
                0 0 0 3px rgba(80, 150, 255, 0.9),
                0 0 0 0 #a3c101;
        }

        60% {
            box-shadow:
                0 0 0 3px rgba(80, 150, 255, 0.9),
                0 0 0 1.5px #a3c101;
        }

        80% {
            box-shadow:
                0 0 0 3px rgba(80, 150, 255, 0.9),
                0 0 0 0 #a3c101;
        }

        100% {
            border-color: #fffa00;
            box-shadow:
                0 0 0 3px rgba(80, 150, 255, 0.9),
                0 0 0 1.5px #fffa00;
        }
    }

    @media screen and (min-width: 301px) and (max-width: 500px) {
        .card {
            margin: 0.5px;
            border-width: 4px;
        }
    }

    @media screen and (min-width: 1000px) {
        .image {
            max-height: 300px;
        }
    }

    @media screen and (min-width: 500px) and (max-width: 1000px) {
        .image {
            max-height: 400px;
        }
    }

    @media screen and (max-width: 500px) {
        .image {
            max-height: 110vw;
        }

        .stat span {
            font-size: 12px;
        }

        .user span {
            font-size: 14px;
        }

        .title {
            font-size: 16px;
        }

        .tag {
            font-size: 11px;
        }

        .text {
            font-size: 12px;
        }
    }
</style>
