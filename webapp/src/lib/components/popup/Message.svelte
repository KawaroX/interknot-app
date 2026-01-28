<script lang="ts">
    import { goto } from "$app/navigation";
    import { browser } from "$app/environment";
    import { fade } from "svelte/transition";
    import { onMount } from "svelte";
    import Window from "$lib/components/common/Window.svelte";
    import Avatar from "$lib/components/common/Avatar.svelte";
    import Level from "$lib/components/common/Level.svelte";
    import { pb } from "$lib/api/pb";
    import { buildFileUrl } from "$lib/api/files";
    import { closePopup, openCompose, openImage } from "$lib/stores/popup";
    import { setFollow } from "$lib/api/follows";
    import { addFollowing, removeFollowing } from "$lib/stores/follows";
    import {
        markPostRead,
        updateAuthorFollow,
        updatePostLike,
    } from "$lib/stores/posts";
    import {
        createComment,
        getPost,
        reportTarget,
        toggleLike,
    } from "$lib/api/posts";
    import RateLimitAlert from "$lib/components/common/RateLimitAlert.svelte";
    import type { CommentItem, PostDetail } from "$lib/types";
    import { defaultAvatar } from "$lib/data/characters";
    import {
        COMMENT_MAX,
        REPORT_DETAIL_MAX,
        getGraphemeCount,
    } from "$lib/validation";
    import { showToast } from "$lib/stores/toast";
    import { receive, selectedCardId } from "$lib/stores/cardTransition";
    import { session } from "$lib/stores/session";
    import { openContextMenu } from "$lib/stores/contextMenu";
    import { clearPendingReport, pendingReport } from "$lib/stores/report";

    export let postId: string;

    let post: PostDetail | null = null;
    let loading = true;
    let loadError = "";
    let actionError = "";
    let commentText = "";
    let likeCount = 0;
    let liked = false;
    let postReported = false;
    let reportedCommentIds = new Set<string>();
    let authorFollowed = false;
    let canFollow = false;
    let reportOpen = false;
    let reportTargetType: "post" | "comment" | null = null;
    let reportTargetId = "";
    let reportTargetLabel = "";
    let reportCategory = "垃圾广告";
    let reportDetail = "";
    let reportError = "";
    let reportSubmitting = false;
    let rateLimitError: { message: string; retryAfter: number } | null = null;
    let bodyExpanded = false;

    const BODY_PREVIEW_LIMIT = 280;
    const BODY_PREVIEW_LINES = 8;

    const reportCategories = [
        "垃圾广告",
        "色情低俗",
        "辱骂仇恨",
        "违法违禁",
        "侵犯权益",
        "其他",
    ];

    const formatDate = (value: string) => {
        if (!value) return "";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return value;
        return date.toLocaleString("zh-CN", { hour12: false });
    };

    const getPostTime = (postItem: PostDetail) => {
        const createdAt = postItem.createdAt;
        const editedAt = postItem.editedAt;
        const createdTime = new Date(createdAt).getTime();
        const editedTime = editedAt ? new Date(editedAt).getTime() : Number.NaN;
        const isEdited =
            Boolean(editedAt) &&
            !Number.isNaN(editedTime) &&
            Math.abs(editedTime - createdTime) > 1000;
        return {
            label: isEdited ? "编辑时间" : "发布时间",
            value: isEdited && editedAt ? editedAt : createdAt,
        };
    };

    const resetActionStatus = () => {
        actionError = "";
    };

    $: viewerId = pb.authStore.model?.id ?? "";
    $: currentUser = $session;
    $: currentUserAvatar = currentUser?.avatar
        ? (buildFileUrl(currentUser, currentUser.avatar) ?? defaultAvatar)
        : defaultAvatar;
    $: canFollow = Boolean(post && viewerId && post.author.id !== viewerId);
    $: isAuthor = Boolean(post && viewerId && post.author.id === viewerId);
    $: commentLength = getGraphemeCount(commentText.trim());
    $: commentOverLimit = commentLength > COMMENT_MAX;
    $: reportDetailOverLimit =
        getGraphemeCount(reportDetail.trim()) > REPORT_DETAIL_MAX;
    $: bodyText = post?.body ?? "";
    $: bodyLineCount = bodyText.split("\n").length;
    $: bodyLong =
        bodyText.trim().length > BODY_PREVIEW_LIMIT ||
        bodyLineCount > BODY_PREVIEW_LINES;
    $: if (!bodyLong) {
        bodyExpanded = true;
    }
    $: if (post && $pendingReport?.type === "post") {
        if ($pendingReport.postId === post.id) {
            openReportForm("post", post.id, post.title);
            clearPendingReport();
        }
    }

    const ensureAuth = () => {
        if (!pb.authStore.isValid) {
            goto("/login");
            return false;
        }
        return true;
    };

    const loadPost = async () => {
        if (!postId) return;
        loading = true;
        loadError = "";
        actionError = "";
        liked = false;
        postReported = false;
        reportedCommentIds = new Set();
        authorFollowed = false;
        try {
            post = await getPost(postId);
            bodyExpanded = false;
            likeCount = post.likeCount;
            liked = post.likedByViewer ?? false;
            authorFollowed = post.authorFollowedByViewer ?? false;
            postReported = post.reportedByViewer ?? false;
            reportedCommentIds = new Set(
                post.comments
                    .filter((comment) => comment.reportedByViewer)
                    .map((comment) => comment.id),
            );
            if (pb.authStore.isValid) {
                markPostRead(post.id);
            }
        } catch (err) {
            loadError = "加载失败";
        } finally {
            loading = false;
        }
    };

    onMount(() => {
        void loadPost();
    });

    const submitComment = async () => {
        if (!ensureAuth()) return;
        resetActionStatus();
        rateLimitError = null;
        const trimmedComment = commentText.trim();
        if (!post || !trimmedComment) return;
        if (getGraphemeCount(trimmedComment) > COMMENT_MAX) {
            alert("评论最多 2000 字。");
            return;
        }
        try {
            const result = await createComment(post.id, trimmedComment);
            post = {
                ...post,
                comments: [
                    ...post.comments,
                    {
                        ...result.comment,
                        reportedByViewer: false,
                    },
                ],
                commentCount: post.commentCount + 1,
            };
            commentText = "";
        } catch (err) {
            console.error("comment_failed", err);
            const ex = err as any;
            if (
                ex.code === 429 ||
                ex.reason?.includes("limit") ||
                ex.reason?.includes("cooldown")
            ) {
                rateLimitError = {
                    message: ex.detail || "评论过于频繁，请稍后再试。",
                    retryAfter: ex.retryAfter || 0,
                };
                return;
            }

            const message = err instanceof Error ? err.message : "";
            switch (message) {
                case "invite_required":
                    actionError = "需要邀请码才能评论。";
                    break;
                case "invite_invalid":
                    actionError = "邀请码无效。";
                    break;
                case "invite_in_use":
                    actionError = "邀请码已被使用。";
                    break;
                case "can_post_disabled":
                    actionError = "当前账号已被禁止发言。";
                    break;
                case "body_too_long":
                    actionError = "评论最多 2000 字。";
                    break;
                default:
                    actionError = message || "评论失败";
            }
        }
    };

    const handleEdit = () => {
        if (!post) return;
        openCompose(post);
    };

    const togglePostLike = async () => {
        if (!ensureAuth()) return;
        resetActionStatus();
        if (!post) return;
        try {
            const result = await toggleLike(post.id);
            liked = result.liked;
            likeCount = result.likeCount;
            updatePostLike(post.id, liked, likeCount);
        } catch (err) {
            actionError = "点赞失败";
        }
    };

    const buildShareUrl = (postItem: PostDetail) => {
        if (!browser) return "";
        const url = new URL("/", window.location.origin);
        url.searchParams.set("post", postItem.id);
        return url.toString();
    };

    const sharePost = async () => {
        if (!post || !browser) return;
        resetActionStatus();
        const shareUrl = buildShareUrl(post);
        try {
            if (navigator.share) {
                await navigator.share({ url: shareUrl });
                showToast("已分享");
                return;
            }
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(shareUrl);
                showToast("已复制到剪贴板");
                return;
            }
            showToast("当前浏览器不支持分享或复制");
        } catch (err) {
            const error = err as Error;
            if (error?.name === "AbortError") return;
            showToast("分享失败");
        }
    };

    const toggleFollow = async () => {
        if (!ensureAuth()) return;
        resetActionStatus();
        if (!post || !canFollow) return;
        const nextFollow = !authorFollowed;
        try {
            const result = await setFollow(post.author.id, nextFollow);
            authorFollowed = result.following;
            post = post
                ? { ...post, authorFollowedByViewer: authorFollowed }
                : post;
            updateAuthorFollow(post.author.id, authorFollowed);
            if (authorFollowed) {
                addFollowing({
                    ...post.author,
                    followedAt: new Date().toISOString(),
                });
            } else {
                removeFollowing(post.author.id);
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : "";
            switch (message) {
                case "self_follow":
                    actionError = "不能关注自己";
                    break;
                default:
                    actionError = "关注失败";
            }
        }
    };

    const reportPost = async () => {
        if (!post) return;
        openReportForm("post", post.id, post.title);
    };

    const reportComment = async (comment: CommentItem) => {
        openReportForm("comment", comment.id, comment.body);
    };

    const openReportForm = (
        targetType: "post" | "comment",
        targetId: string,
        label: string,
    ) => {
        if (!ensureAuth()) return;
        resetActionStatus();
        reportError = "";
        if (targetType === "post" && postReported) return;
        if (targetType === "comment" && reportedCommentIds.has(targetId))
            return;
        reportTargetType = targetType;
        reportTargetId = targetId;
        reportTargetLabel = label;
        reportCategory = reportCategories[0];
        reportDetail = "";
        reportOpen = true;
    };

    const closeReportForm = () => {
        reportOpen = false;
        reportTargetType = null;
        reportTargetId = "";
        reportTargetLabel = "";
        reportCategory = reportCategories[0];
        reportDetail = "";
        reportError = "";
    };

    const submitReport = async () => {
        if (!reportTargetType || !reportTargetId) return;
        reportError = "";
        if (!reportCategory) {
            reportError = "请选择举报类型。";
            return;
        }
        const trimmedDetail = reportDetail.trim();
        if (reportDetailOverLimit) {
            reportError = "补充说明最多 500 字。";
            return;
        }
        reportSubmitting = true;
        try {
            if (reportTargetType === "post") {
                await reportTarget({
                    targetType: "post",
                    postId: reportTargetId,
                    reasonCategory: reportCategory,
                    reasonDetail: trimmedDetail || undefined,
                });
                postReported = true;
            } else {
                await reportTarget({
                    targetType: "comment",
                    commentId: reportTargetId,
                    reasonCategory: reportCategory,
                    reasonDetail: trimmedDetail || undefined,
                });
                reportedCommentIds = new Set([
                    ...reportedCommentIds,
                    reportTargetId,
                ]);
            }
            closeReportForm();
        } catch (err) {
            const message = err instanceof Error ? err.message : "";
            switch (message) {
                case "reason_missing":
                    reportError = "请填写举报事由。";
                    break;
                case "reason_detail_too_long":
                    reportError = "补充说明最多 500 字。";
                    break;
                default:
                    reportError = "举报失败";
            }
        } finally {
            reportSubmitting = false;
        }
    };

    const copyText = async (text: string, successMessage: string) => {
        try {
            await navigator.clipboard.writeText(text);
            showToast(successMessage);
        } catch (err) {
            showToast("复制失败");
        }
    };

    const saveImage = (url: string) => {
        try {
            const link = document.createElement("a");
            link.href = url;
            link.download = "image";
            link.rel = "noopener";
            link.target = "_blank";
            document.body.appendChild(link);
            link.click();
            link.remove();
            showToast("已开始保存");
        } catch (err) {
            showToast("保存失败");
        }
    };

    const openImageMenu = (event: MouseEvent) => {
        if (!post?.coverUrl) return;
        event.preventDefault();
        event.stopPropagation();
        openContextMenu({
            x: event.clientX,
            y: event.clientY,
            items: [
                {
                    label: "打开",
                    action: () => openImage(post.coverUrl ?? ""),
                },
                {
                    label: "保存图片",
                    action: () => saveImage(post.coverUrl ?? ""),
                },
                {
                    label: liked ? "取消点赞" : "点赞",
                    action: togglePostLike,
                },
                { label: "分享", action: sharePost },
                {
                    label: postReported ? "已举报" : "举报",
                    action: reportPost,
                    danger: true,
                    disabled: postReported,
                },
            ],
        });
    };

    const openPostMenu = (event: MouseEvent) => {
        if (!post) return;
        event.preventDefault();
        event.stopPropagation();
        openContextMenu({
            x: event.clientX,
            y: event.clientY,
            items: [
                {
                    label: authorFollowed ? "取消关注" : "关注",
                    action: toggleFollow,
                },
                {
                    label: liked ? "取消点赞" : "点赞",
                    action: togglePostLike,
                },
                { label: "分享", action: sharePost },
                {
                    label: "举报",
                    action: reportPost,
                    danger: true,
                },
                {
                    label: "复制正文",
                    action: () => copyText(post.body ?? "", "已复制正文"),
                },
            ],
        });
    };

    const followCommentAuthor = async (comment: CommentItem) => {
        if (!ensureAuth()) return;
        try {
            const result = await setFollow(comment.author.id, true);
            if (result.following) {
                addFollowing({
                    ...comment.author,
                    followedAt: new Date().toISOString(),
                });
                showToast("已关注评论者");
            } else {
                showToast("关注失败");
            }
        } catch (err) {
            showToast("关注失败");
        }
    };

    const openCommentMenu = (event: MouseEvent, comment: CommentItem) => {
        event.preventDefault();
        event.stopPropagation();
        const reported = reportedCommentIds.has(comment.id);
        openContextMenu({
            x: event.clientX,
            y: event.clientY,
            items: [
                {
                    label: "关注评论者",
                    action: () => followCommentAuthor(comment),
                },
                {
                    label: reported ? "已举报" : "举报",
                    action: () => reportComment(comment),
                    danger: true,
                    disabled: reported,
                },
                {
                    label: "复制评论",
                    action: () => copyText(comment.body, "已复制评论"),
                },
            ],
        });
    };
</script>

<div class="popup-shell" transition:fade={{ duration: 100 }}>
    <Window variant="message-window" height="70%" onClose={closePopup}>
        <svelte:fragment slot="header">
            {#if post}
                <div class="user">
                    <Avatar
                        class={authorFollowed ? "following" : ""}
                        src={post.author.avatarUrl ?? defaultAvatar}
                        size={40}
                    />
                    <div class="name">
                        <span>{post.author.name}</span>
                        <Level level={post.author.level ?? undefined} />
                    </div>
                    {#if canFollow}
                        <button
                            class="follow-btn"
                            class:active={authorFollowed}
                            type="button"
                            on:click={toggleFollow}
                        >
                            {authorFollowed ? "已关注" : "关注"}
                        </button>
                    {/if}
                </div>
            {/if}
        </svelte:fragment>
        <svelte:fragment slot="header-actions">
            {#if isAuthor}
                <button
                    type="button"
                    class="action edit"
                    on:click={handleEdit}
                >
                    编辑
                </button>
            {/if}
        </svelte:fragment>
        {#if loading}
            <div class="loading">加载中...</div>
        {:else if loadError}
            <div class="loading">{loadError}</div>
        {:else if post}
            {@const time = getPostTime(post)}
            <div class="split-layout">
                <div class="split-left">
                    <button
                        class="image"
                        type="button"
                        aria-label="查看图片"
                        in:receive={{ key: $selectedCardId }}
                        on:click={() =>
                            post?.coverUrl && openImage(post.coverUrl)}
                        on:contextmenu={openImageMenu}
                    >
                        {#if post.coverUrl}
                            <img src={post.coverUrl} alt="" />
                        {:else}
                            <img src="/images/empty.webp" alt="" />
                        {/if}
                    </button>
                    <div class="actions">
                        <button
                            type="button"
                            class="action"
                            class:liked
                            on:click={togglePostLike}
                        >
                            {#if liked}
                                <span class="action-icon" aria-hidden="true">
                                    <svg
                                        viewBox="0 0 122.88 106.16"
                                        role="img"
                                        aria-hidden="true"
                                    >
                                        <path
                                            fill="currentColor"
                                            fill-rule="evenodd"
                                            clip-rule="evenodd"
                                            d="M4.02 44.6h27.36c2.21 0 4.02 1.81 4.02 4.03v53.51c0 2.21-1.81 4.03-4.02 4.03H4.02c-2.21 0-4.02-1.81-4.02-4.03V48.63c0-2.22 1.81-4.03 4.02-4.03zM63.06 4.46c2.12-10.75 19.72-.85 20.88 16.48.35 5.3-.2 11.47-1.5 18.36h25.15c10.46.41 19.59 7.9 13.14 20.2 1.47 5.36 1.69 11.65-2.3 14.13.5 8.46-1.84 13.7-6.22 17.84-.29 4.23-1.19 7.99-3.23 10.88-3.38 4.77-6.12 3.63-11.44 3.63H55.07c-6.73 0-10.4-1.85-14.8-7.37V51.31c12.66-3.42 19.39-20.74 22.79-32.11V4.46z"
                                        />
                                    </svg>
                                </span>
                                <span class="action-count">{likeCount}</span>
                            {:else}
                                <span class="action-icon" aria-hidden="true">
                                    <svg
                                        viewBox="0 0 122.88 105.01"
                                        role="img"
                                        aria-hidden="true"
                                    >
                                        <path
                                            fill="currentColor"
                                            fill-rule="evenodd"
                                            d="M62.63,6.25c0.56-2.85,2.03-4.68,4.04-5.61c1.63-0.76,3.54-0.83,5.52-0.31c1.72,0.45,3.53,1.37,5.26,2.69 c4.69,3.57,9.08,10.3,9.64,18.71c0.17,2.59.12,5.35-.12,8.29c-0.16,1.94-.41,3.98-.75,6.1h19.95l.09,0.01 c3.24,0.13,6.38,0.92,9.03,2.3c2.29,1.2,4.22,2.84,5.56,4.88c1.38,2.1,2.13,4.6,2.02,7.46c-0.08,2.12-.65,4.42-1.81,6.87 c0.66,2.76,0.97,5.72,0.54,8.32c-0.36,2.21-1.22,4.17-2.76,5.63c0.08,3.65-.41,6.71-1.39,9.36c-1.01,2.72-2.52,4.98-4.46,6.98 c-0.17,1.75-.45,3.42-.89,4.98c-0.55,1.96-1.36,3.76-2.49,5.35l0,0c-3.4 4.8-6.12 4.69-10.43 4.51c-0.6-.02-1.24-.05-2.24-.05 l-39.03 0c-3.51 0-6.27-.51-8.79-1.77c-2.49-1.25-4.62-3.17-6.89-6.01l-0.58-1.66V47.78l1.98-0.53 c5.03-1.36,8.99-5.66,12.07-10.81c3.16-5.3,5.38-11.5,6.9-16.51V6.76L62.63,6.25L62.63,6.25L62.63,6.25z M4,43.02h29.08 c2.2,0,4,1.8,4,4v53.17c0,2.2-1.8,4-4,4l-29.08,0c-2.2,0-4-1.8-4-4V47.02C0,44.82,1.8,43.02,4,43.02L4,43.02L4,43.02z M68.9,5.48 c-0.43,0.2-0.78,0.7-.99,1.56V20.3l-0.12,0.76c-1.61,5.37-4.01,12.17-7.55,18.1c-3.33,5.57-7.65,10.36-13.27,12.57v40.61 c1.54,1.83,2.96,3.07,4.52,3.85c1.72.86 3.74 1.2 6.42 1.2l39.03 0c0.7 0 1.6.04 2.45.07 2.56.1,4.17.17 5.9-2.27v-0.01 c0.75-1.06 1.3-2.31 1.69-3.71c0.42-1.49.67-3.15.79-4.92l0.82-1.75c1.72-1.63,3.03-3.46,3.87-5.71 c0.86-2.32,1.23-5.11,1.02-8.61l-0.09-1.58l1.34-0.83c0.92-0.57,1.42-1.65,1.63-2.97c0.34-2.1-.02-4.67-.67-7.06l0.21-1.93 c1.08-2.07,1.6-3.92,1.67-5.54c0.06-1.68-.37-3.14-1.17-4.35c-0.84-1.27-2.07-2.31-3.56-3.09c-1.92-1.01-4.24-1.59-6.66-1.69v0.01 l-26.32 0l0.59-3.15c0.57-3.05,0.98-5.96,1.22-8.72c0.23-2.7,0.27-5.21.12-7.49c-0.45-6.72-3.89-12.04-7.56-14.83 c-1.17-0.89-2.33-1.5-3.38-1.77C70.04,5.27,69.38,5.26,68.9,5.48L68.9,5.48L68.9,5.48z"
                                        />
                                    </svg>
                                </span>
                                <span>点赞</span>
                                <span class="action-count">{likeCount}</span>
                            {/if}
                        </button>
                        <button type="button" class="action" on:click={sharePost}>
                            分享
                        </button>
                        <button
                            type="button"
                            class="action report-action"
                            class:reported={postReported}
                            on:click={reportPost}
                            disabled={postReported}
                        >
                            {postReported ? "已举报" : "举报"}
                        </button>
                    </div>
                </div>
                <div class="split-right">
                    <div class="message" on:contextmenu={openPostMenu}>
                        <div class="title">{post.title}</div>
                        <div class="meta">
                            <span>{time.label}：{formatDate(time.value)}</span>
                            <span>IP属地：{post.ipRegion || "未知"}</span>
                        </div>
                        {#if post.tags && post.tags.length > 0}
                            <div class="tags">
                                {#each post.tags as tag}
                                    <span class="tag">#{tag}</span>
                                {/each}
                            </div>
                        {/if}
                        <div
                            class="text"
                            class:collapsed={bodyLong && !bodyExpanded}
                        >
                            {post.body}
                        </div>
                        {#if bodyLong}
                            <button
                                class="read-more"
                                type="button"
                                on:click={() => (bodyExpanded = !bodyExpanded)}
                            >
                                {bodyExpanded ? "收起" : "查看全文"}
                            </button>
                        {/if}
                        <div class="actions">
                            <button
                                type="button"
                                class="action"
                                class:liked
                                on:click={togglePostLike}
                            >
                                {#if liked}
                                    <span
                                        class="action-icon"
                                        aria-hidden="true"
                                    >
                                        <svg
                                            viewBox="0 0 122.88 106.16"
                                            role="img"
                                            aria-hidden="true"
                                        >
                                            <path
                                                fill="currentColor"
                                                fill-rule="evenodd"
                                                clip-rule="evenodd"
                                                d="M4.02 44.6h27.36c2.21 0 4.02 1.81 4.02 4.03v53.51c0 2.21-1.81 4.03-4.02 4.03H4.02c-2.21 0-4.02-1.81-4.02-4.03V48.63c0-2.22 1.81-4.03 4.02-4.03zM63.06 4.46c2.12-10.75 19.72-.85 20.88 16.48.35 5.3-.2 11.47-1.5 18.36h25.15c10.46.41 19.59 7.9 13.14 20.2 1.47 5.36 1.69 11.65-2.3 14.13.5 8.46-1.84 13.7-6.22 17.84-.29 4.23-1.19 7.99-3.23 10.88-3.38 4.77-6.12 3.63-11.44 3.63H55.07c-6.73 0-10.4-1.85-14.8-7.37V51.31c12.66-3.42 19.39-20.74 22.79-32.11V4.46z"
                                            />
                                        </svg>
                                    </span>
                                    <span class="action-count">{likeCount}</span
                                    >
                                {:else}
                                    <span
                                        class="action-icon"
                                        aria-hidden="true"
                                    >
                                        <svg
                                            viewBox="0 0 122.88 105.01"
                                            role="img"
                                            aria-hidden="true"
                                        >
                                            <path
                                                fill="currentColor"
                                                fill-rule="evenodd"
                                                d="M62.63,6.25c0.56-2.85,2.03-4.68,4.04-5.61c1.63-0.76,3.54-0.83,5.52-0.31c1.72,0.45,3.53,1.37,5.26,2.69 c4.69,3.57,9.08,10.3,9.64,18.71c0.17,2.59,0.12,5.35-0.12,8.29c-0.16,1.94-0.41,3.98-0.75,6.1h19.95l0.09,0.01 c3.24,0.13,6.38,0.92,9.03,2.3c2.29,1.2,4.22,2.84,5.56,4.88c1.38,2.1,2.13,4.6,2.02,7.46c-0.08,2.12-0.65,4.42-1.81,6.87 c0.66,2.76,0.97,5.72,0.54,8.32c-0.36,2.21-1.22,4.17-2.76,5.63c0.08,3.65-0.41,6.71-1.39,9.36c-1.01,2.72-2.52,4.98-4.46,6.98 c-0.17,1.75-0.45,3.42-0.89,4.98c-0.55,1.96-1.36,3.76-2.49,5.35l0,0c-3.4,4.8-6.12,4.69-10.43,4.51c-0.6-0.02-1.24-0.05-2.24-0.05 l-39.03,0c-3.51,0-6.27-0.51-8.79-1.77c-2.49-1.25-4.62-3.17-6.89-6.01l-0.58-1.66V47.78l1.98-0.53 c5.03-1.36,8.99-5.66,12.07-10.81c3.16-5.3,5.38-11.5,6.9-16.51V6.76L62.63,6.25L62.63,6.25L62.63,6.25z M4,43.02h29.08 c2.2,0,4,1.8,4,4v53.17c0,2.2-1.8,4-4,4l-29.08,0c-2.2,0-4-1.8-4-4V47.02C0,44.82,1.8,43.02,4,43.02L4,43.02L4,43.02z M68.9,5.48 c-0.43,0.2-0.78,0.7-0.99,1.56V20.3l-0.12,0.76c-1.61,5.37-4.01,12.17-7.55,18.1c-3.33,5.57-7.65,10.36-13.27,12.57v40.61 c1.54,1.83,2.96,3.07,4.52,3.85c1.72,0.86,3.74,1.2,6.42,1.2l39.03,0c0.7,0,1.6,0.04,2.45,0.07c2.56,0.1,4.17,0.17,5.9-2.27v-0.01 c0.75-1.06,1.3-2.31,1.69-3.71c0.42-1.49,0.67-3.15,0.79-4.92l0.82-1.75c1.72-1.63,3.03-3.46,3.87-5.71 c0.86-2.32,1.23-5.11,1.02-8.61l-0.09-1.58l1.34-0.83c0.92-0.57,1.42-1.65,1.63-2.97c0.34-2.1-0.02-4.67-0.67-7.06l0.21-1.93 c1.08-2.07,1.6-3.92,1.67-5.54c0.06-1.68-0.37-3.14-1.17-4.35c-0.84-1.27-2.07-2.31-3.56-3.09c-1.92-1.01-4.24-1.59-6.66-1.69v0.01 l-26.32,0l0.59-3.15c0.57-3.05,0.98-5.96,1.22-8.72c0.23-2.7,0.27-5.21,0.12-7.49c-0.45-6.72-3.89-12.04-7.56-14.83 c-1.17-0.89-2.33-1.5-3.38-1.77C70.04,5.27,69.38,5.26,68.9,5.48L68.9,5.48L68.9,5.48z"
                                            />
                                        </svg>
                                    </span>
                                    <span>点赞</span>
                                    <span class="action-count">{likeCount}</span
                                    >
                                {/if}
                            </button>
                            <button
                                type="button"
                                class="action"
                                on:click={sharePost}
                            >
                                分享
                            </button>
                            <button
                                type="button"
                                class="action"
                                class:reported={postReported}
                                on:click={reportPost}
                                disabled={postReported}
                            >
                                {postReported ? "已举报" : "举报"}
                            </button>
                        </div>
                        {#if actionError}
                            <div class="action-error">{actionError}</div>
                        {/if}
                        <div class="comment-list">
                        {#each post.comments as comment, index}
                                <div
                                    class="comment"
                                    on:contextmenu={(event) =>
                                        openCommentMenu(event, comment)}
                                >
                                    <Avatar
                                        class="comment-avatar"
                                        src={comment.author.avatarUrl ??
                                            defaultAvatar}
                                        size={36}
                                    />
                                    <div class="comment-content">
                                        <div class="comment-name">
                                            <span>{comment.author.name}</span>
                                            <span class="floor">
                                                {index + 1}F
                                            </span>
                                        </div>
                                        <div class="comment-meta">
                                            <span
                                                >{formatDate(
                                                    comment.createdAt,
                                                )}</span
                                            >
                                            <span
                                                >IP属地：{comment.ipRegion ||
                                                    "未知"}</span
                                            >
                                        </div>
                                        <div class="comment-text">
                                            {comment.body}
                                        </div>
                                    </div>
                                </div>
                            {/each}
                        </div>
                        <div class="no-more">- 已无更多评论 -</div>
                    </div>
                    <div class="input-footer">
                        <form
                            class="input"
                            on:submit|preventDefault={submitComment}
                        >
                            <Avatar
                                class="input-avatar"
                                src={currentUserAvatar}
                                size={36}
                            />
                            <input
                                type="text"
                                placeholder="回复"
                                bind:value={commentText}
                            />
                            <div
                                class="counter"
                                class:overlimit={commentOverLimit}
                            >
                                {commentLength}/{COMMENT_MAX}
                            </div>
                            <button class="btn" type="submit"> 回复 </button>
                        </form>
                        {#if actionError}
                            <div class="input-error">{actionError}</div>
                        {/if}
                    </div>
                </div>
            </div>
        {/if}
    </Window>
    {#if reportOpen}
        <div
            class="report-overlay"
            transition:fade={{ duration: 120 }}
            on:click={closeReportForm}
        >
            <div class="report-panel" on:click|stopPropagation>
                <div class="report-title">举报内容</div>
                <div class="report-target">{reportTargetLabel}</div>
                <label class="report-label">
                    举报类型
                    <select bind:value={reportCategory}>
                        {#each reportCategories as category}
                            <option value={category}>{category}</option>
                        {/each}
                    </select>
                </label>
                <label class="report-label">
                    补充说明
                    <textarea
                        rows="3"
                        bind:value={reportDetail}
                        placeholder="可选，描述具体原因"
                        maxlength={REPORT_DETAIL_MAX}
                    ></textarea>
                </label>
                {#if reportError}
                    <div class="report-error">{reportError}</div>
                {/if}
                <div class="report-actions">
                    <button
                        type="button"
                        class="report-btn cancel"
                        on:click={closeReportForm}
                    >
                        取消
                    </button>
                    <button
                        type="button"
                        class="report-btn primary"
                        on:click={submitReport}
                        disabled={reportSubmitting}
                    >
                        {reportSubmitting ? "提交中..." : "提交举报"}
                    </button>
                </div>
            </div>
        </div>
    {/if}
    {#if rateLimitError}
        <RateLimitAlert
            title="发送失败"
            message={rateLimitError.message}
            retryAfter={rateLimitError.retryAfter}
            onClose={() => (rateLimitError = null)}
        />
    {/if}
</div>

<style>
    :global(.message-window) {
        cursor: default;
    }

    .loading {
        color: #999;
        padding: 20px;
    }

    :global(.message-window .content) {
        bottom: 0px;
        left: 0;
        right: 0;
        padding: 0;
    }

    .split-layout {
        display: flex;
        width: 100%;
        height: 100%;
        gap: 0;
        align-items: stretch;
    }

    .split-left {
        display: flex;
        flex: 0 0 50%;
        align-items: flex-start;
        position: relative;
    }

    .split-right {
        display: flex;
        flex: 1;
        flex-direction: column;
        min-width: 0;
        gap: 8px;
        padding: 12px 12px 12px 16px;
    }

    .input-footer {
        flex-shrink: 0;
        padding: 0 4px 4px;
    }

    .user {
        display: flex;
        align-items: center;
        cursor: pointer;
        user-select: none;
        gap: 10px;
    }

    .name {
        display: flex;
        flex-direction: column;
    }

    .follow-btn {
        margin-left: auto;
        border: none;
        border-radius: 999px;
        padding: 6px 12px;
        background: #1f1f1f;
        color: #cfcfcf;
        font-size: 13px;
        cursor: pointer;
    }

    .follow-btn.active {
        background: #2fbf5b;
        color: #0b0b0b;
    }

    .name span {
        height: 20px;
        color: #a1a0a1;
        font-size: 18px;
    }

    .image {
        position: relative;
        display: flex;
        justify-content: center;
        align-items: center;
        overflow: hidden;
        box-sizing: border-box;
        width: 100%;
        aspect-ratio: 3 / 4;
        max-height: 100%;
        /*border-radius: 20px;*/
        border: 0px;
        background: transparent;
        padding: 0;
        cursor: pointer;
        /*appearance: none;*/
    }

    .image img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .message {
        display: flex;
        flex: 1;
        flex-direction: column;
        overflow-x: hidden;
        overflow-y: auto;
        box-sizing: border-box;
        min-height: 0;
        padding: 12px 16px;
        width: 100%;
        border-radius: 20px;
        background: #000;
        mask-image: linear-gradient(
            to bottom,
            transparent,
            #000 30px,
            #000,
            #000 calc(100% - 30px),
            transparent
        );
        mask-size: 100% 100%;
        mask-position: 0 0;
        mask-repeat: no-repeat;
    }

    .title {
        box-sizing: border-box;
        margin-bottom: 10px;
        padding: 2px;
        padding-top: 10px;
        width: 100%;
        color: #fff;
        word-break: break-all;
    }

    .meta {
        display: flex;
        margin-bottom: 10px;
        padding: 0 2px;
        gap: 12px;
        flex-wrap: wrap;
        color: #777;
        font-size: 12px;
    }

    .tags {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin: 0 2px 10px;
    }

    .tag {
        padding: 2px 6px;
        border-radius: 4px;
        background: rgba(163, 193, 1, 0.15);
        color: #a3c101;
        font-size: 12px;
    }

    .text {
        box-sizing: border-box;
        /*margin-bottom: 12px;*/
        padding: 2px;
        color: #b2b0b3;
        white-space: pre-wrap;
        word-break: break-word;
        font-weight: normal;
    }

    .text.collapsed {
        position: relative;
        max-height: 180px;
        overflow: hidden;
    }

    .text.collapsed::after {
        content: "";
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 48px;
        background: linear-gradient(180deg, rgba(0, 0, 0, 0), #000 70%);
        pointer-events: none;
    }

    .read-more {
        align-self: flex-end;
        /*margin-bottom: 12px;*/
        border: 1px solid #2a2a2a;
        border-radius: 999px;
        padding: 4px 12px;
        background: transparent;
        color: #a3c101;
        font-size: 12px;
        cursor: pointer;
    }

    .read-more:hover {
        border-color: #a3c101;
        background: #a3c101;
        color: #000;
    }

    .actions {
        position: absolute;
        right: 12px;
        bottom: 12px;
        z-index: 2;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 8px;
        opacity: 0;
        transform: translateX(18px);
        pointer-events: none;
        transition:
            transform 0.25s cubic-bezier(0.22, 1, 0.36, 1),
            opacity 0.2s ease;
        background: transparent;
        box-shadow: none;
    }

    .split-left:hover .actions {
        opacity: 1;
        transform: translateX(0);
        pointer-events: auto;
    }

    .split-right .actions {
        display: none;
    }

    .action-error {
        margin-bottom: 12px;
        color: #ff7b7b;
    }

    .action {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border: none;
        border-radius: 12px;
        padding: 6px 12px;
        background: rgba(27, 27, 27, 0.6);
        color: #fff;
        cursor: pointer;
        box-shadow:
            0 8px 16px rgba(0, 0, 0, 0.25),
            0 0 0 1px rgba(255, 255, 255, 0.06);
        backdrop-filter: blur(4px);
    }

    .action:disabled {
        cursor: default;
        opacity: 0.7;
    }

    .action.liked {
        background: rgba(163, 193, 1, 0.62);
        color: #fff;
        box-shadow:
            0 8px 18px rgba(163, 193, 1, 0.35),
            0 0 0 1px rgba(163, 193, 1, 0.35);
    }

    .action.reported {
        background: rgba(194, 58, 43, 0.62);
        color: #fff;
        box-shadow:
            0 8px 18px rgba(194, 58, 43, 0.35),
            0 0 0 1px rgba(194, 58, 43, 0.35);
    }

    .action.edit {
        background: #1b1b1b;
        color: #a3c101;
    }

    .action.edit:hover {
        background: #a3c101;
        color: #000;
    }

    .action-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        vertical-align: middle;
    }

    .action-icon svg {
        width: 20px;
        height: 20px;
    }

    .action-count {
        font-variant-numeric: tabular-nums;
    }

    .action:hover:not(.reported) {
        background: rgba(163, 193, 1, 0.7);
        color: #fff;
        box-shadow:
            0 8px 18px rgba(163, 193, 1, 0.35),
            0 0 0 1px rgba(163, 193, 1, 0.35);
    }

    .action.report-action:hover {
        background: rgba(194, 58, 43, 0.7);
        color: #fff;
        box-shadow:
            0 8px 18px rgba(194, 58, 43, 0.35),
            0 0 0 1px rgba(194, 58, 43, 0.35);
    }

    .action.reported:hover {
        background: rgba(194, 58, 43, 0.62);
        color: #fff;
        box-shadow:
            0 8px 18px rgba(194, 58, 43, 0.35),
            0 0 0 1px rgba(194, 58, 43, 0.35);
    }

    .comment {
        display: flex;
        padding-top: 10px;
        border-top: 3px solid #1e1c1f;
    }

    .comment:first-child {
        border-top: none;
    }

    :global(.comment .comment-avatar) {
        width: 36px;
        height: 36px;
    }

    .comment-content {
        flex: 1;
        margin: 0 10px;
        padding-bottom: 10px;
    }

    .comment-name {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin: 0 0 2px 2px;
    }

    .comment-name span {
        color: #fff;
    }

    .floor {
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 0 10px;
        height: 20px;
        border-radius: 10px;
        background-color: #615f62;
        font-weight: bold;
        font-size: 12px;
        cursor: default;
        user-select: none;
        color: #000;
    }

    .comment-text {
        box-sizing: border-box;
        margin-top: 4px;
        padding: 2px;
        color: #959295;
    }

    .comment-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 4px;
        padding: 0 2px;
        font-size: 11px;
        color: #7a7a7a;
    }

    .no-more {
        padding-top: 15px;
        border-top: 3px solid #1e1c1f;
        color: #666;
        text-align: center;
    }

    .input {
        position: relative;
        display: flex;
        align-items: center;
        box-sizing: border-box;
        width: 100%;
        height: 44px;
        border: 4px solid #313131;
        border-radius: 22px;
        background-color: #000;
        font-size: 16px;
    }

    .input-error {
        margin-top: 6px;
        padding-left: 12px;
        color: #ff7b7b;
        font-size: 12px;
    }

    :global(.input .input-avatar) {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
    }

    .input input {
        flex: 1;
        overflow: hidden;
        box-sizing: border-box;
        padding: 0 10px 0 56px;
        width: 100px;
        height: 100%;
        outline: none;
        border: none;
        background-color: transparent;
        color: #fff;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .input .counter {
        font-size: 12px;
        color: #666;
        margin-right: 4px;
        flex-shrink: 0;
    }

    .input .counter.overlimit {
        color: #ff7b7b;
    }

    .btn {
        display: flex;
        flex-shrink: 0;
        justify-content: center;
        align-items: center;
        margin: 0;
        padding: 0 10px;
        width: 70px;
        height: 100%;
        outline: none;
        border: none;
        border-radius: 20px;
        background-color: transparent;
        color: #fff;
        text-align: center;
        cursor: pointer;
        user-select: none;
    }

    .btn:hover {
        background-color: #a3c101;
        color: #000;
    }

    .report-overlay {
        position: fixed;
        inset: 0;
        z-index: 30;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        background: rgba(0, 0, 0, 0.65);
    }

    .report-panel {
        display: flex;
        flex-direction: column;
        gap: 12px;
        width: min(520px, 92vw);
        max-height: 80vh;
        overflow: auto;
        border: 2px solid #2a2a2a;
        border-radius: 18px;
        background: #0b0b0b;
        padding: 18px 20px 20px;
        color: #e6e6e6;
    }

    .report-title {
        font-size: 18px;
        color: #fff;
    }

    .report-target {
        font-size: 13px;
        color: #888;
        line-height: 1.4;
        max-height: 54px;
        overflow: hidden;
    }

    .report-label {
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: 13px;
        color: #cfcfcf;
    }

    .report-label select,
    .report-label textarea {
        border: 2px solid #2a2a2a;
        border-radius: 10px;
        padding: 8px 10px;
        background: #111;
        color: #fff;
    }

    .report-label textarea {
        resize: vertical;
        min-height: 80px;
    }

    .report-error {
        color: #ff7b7b;
        font-size: 12px;
    }

    .report-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 4px;
    }

    .report-btn {
        border: none;
        border-radius: 12px;
        padding: 8px 14px;
        cursor: pointer;
        font-size: 14px;
    }

    .report-btn:disabled {
        cursor: default;
        opacity: 0.7;
    }

    .report-btn.cancel {
        background: #2b2b2b;
        color: #d0d0d0;
    }

    .report-btn.primary {
        background: #c23a2b;
        color: #fff;
    }

    @media screen and (max-width: 700px) and (max-aspect-ratio: 1 / 1) {
        .split-layout {
            flex-direction: column;
            gap: 12px;
        }

        .split-left {
            flex: none;
            width: 100%;
        }

        .split-right {
            flex: 1;
            gap: 8px;
        }

        .image {
            width: 100%;
            max-width: none;
            aspect-ratio: 3 / 4;
        }

        .message {
            flex: 1 0 auto;
            overflow: unset;
            padding: 12px;
        }

        .input-footer {
            padding: 0;
        }

        .input {
            border: 4px solid #000;
            border-radius: 12px;
        }

        :global(.input .input-avatar) {
            left: 12px;
        }

        .input input {
            padding-left: 68px;
        }
    }
</style>
