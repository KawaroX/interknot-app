<script lang="ts">
    import { onMount } from "svelte";
    import { get } from "svelte/store";
    import PostsGrid from "$lib/components/PostsGrid.svelte";
    import { listPosts } from "$lib/api/posts";
    import { openMessage } from "$lib/stores/popup";
    import {
        loadPosts,
        posts,
        postsLoading,
        searchQuery,
    } from "$lib/stores/posts";
    import type { PostSummary } from "$lib/types";

    const PULL_THRESHOLD = 70;
    const PULL_MAX = 120;
    const AUTO_REFRESH_MS = 90000;
    const TOP_REFRESH_COOLDOWN = 20000;
    const SCROLL_TOP_TRIGGER = 80;

    let pullDistance = 0;
    let pullReady = false;
    let pullRefreshing = false;
    let pullStartY: number | null = null;
    let isAtTop = true;
    let lastScrollTop = 0;
    let lastRefreshAt = 0;
    let lastTopRefreshAt = 0;
    let pendingNewCount = 0;
    let pendingHasUpdates = false;
    let refreshInFlight = false;
    let checkInFlight = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let isCompactLayout = false;
    let lastPostsKey = "";
    let lastSearch = "";

    const getSignature = (items: PostSummary[]) =>
        items.map((item) => item.id).join("|");

    const updateLayout = () => {
        isCompactLayout = window.innerWidth <= 500;
    };

    const resetPull = () => {
        pullStartY = null;
        pullReady = false;
        if (!pullRefreshing) {
            pullDistance = 0;
        }
    };

    const refreshPosts = async (options: { silent?: boolean } = {}) => {
        if (refreshInFlight || get(postsLoading)) {
            return;
        }
        refreshInFlight = true;
        pendingNewCount = 0;
        pendingHasUpdates = false;
        lastRefreshAt = Date.now();
        const currentSearch = get(searchQuery);
        try {
            await loadPosts(currentSearch, { silent: options.silent });
        } catch (err) {
            console.error("posts_refresh_failed", err);
        } finally {
            refreshInFlight = false;
        }
    };

    const triggerPullRefresh = async () => {
        if (refreshInFlight || get(postsLoading)) {
            resetPull();
            return;
        }
        pullRefreshing = true;
        pullDistance = PULL_THRESHOLD;
        try {
            await refreshPosts();
        } finally {
            pullRefreshing = false;
            pullDistance = 0;
            pullReady = false;
        }
    };

    const handleTouchStart = (event: TouchEvent) => {
        if (!isCompactLayout || get(postsLoading) || refreshInFlight) return;
        const target = event.currentTarget as HTMLDivElement;
        if (target.scrollTop > 0) return;
        pullStartY = event.touches[0]?.clientY ?? null;
    };

    const handleTouchMove = (event: TouchEvent) => {
        if (!isCompactLayout || pullStartY === null || refreshInFlight) return;
        const target = event.currentTarget as HTMLDivElement;
        if (target.scrollTop > 0) {
            resetPull();
            return;
        }
        const currentY = event.touches[0]?.clientY ?? pullStartY;
        const delta = currentY - pullStartY;
        if (delta <= 0) {
            pullDistance = 0;
            pullReady = false;
            return;
        }
        pullDistance = Math.min(delta, PULL_MAX);
        pullReady = pullDistance >= PULL_THRESHOLD;
        if (pullDistance > 0) {
            event.preventDefault();
        }
    };

    const handleTouchEnd = () => {
        if (!isCompactLayout) return;
        if (pullReady) {
            void triggerPullRefresh();
        } else {
            pullDistance = 0;
            pullReady = false;
        }
        pullStartY = null;
    };

    const handleScroll = (event: Event) => {
        const target = event.currentTarget as HTMLDivElement;
        const current = target.scrollTop;
        const wasAway = lastScrollTop > SCROLL_TOP_TRIGGER;
        isAtTop = current <= 0;
        if (isAtTop && wasAway) {
            const now = Date.now();
            if (
                now - lastTopRefreshAt > TOP_REFRESH_COOLDOWN &&
                now - lastRefreshAt > TOP_REFRESH_COOLDOWN
            ) {
                lastTopRefreshAt = now;
                void refreshPosts();
            }
        }
        lastScrollTop = current;
    };

    const checkForUpdates = async () => {
        if (checkInFlight || refreshInFlight || get(postsLoading)) return;
        if (document.hidden) return;
        checkInFlight = true;
        try {
            const currentSearch = get(searchQuery);
            const nextItems = await listPosts(currentSearch);
            const currentItems = get(posts);
            if (getSignature(nextItems) === getSignature(currentItems)) {
                return;
            }
            const currentIds = new Set(currentItems.map((item) => item.id));
            const newCount = nextItems.filter(
                (item) => !currentIds.has(item.id),
            ).length;
            if (isAtTop) {
                await refreshPosts({ silent: true });
            } else {
                pendingHasUpdates = true;
                pendingNewCount = newCount;
            }
        } catch (err) {
            console.error("posts_refresh_check_failed", err);
        } finally {
            checkInFlight = false;
        }
    };

    const handleKeydown = (event: KeyboardEvent) => {
        const key = event.key.toLowerCase();
        if (key !== "r" || event.altKey || event.shiftKey) return;
        const target = event.target as HTMLElement | null;
        const tagName = target?.tagName;
        const isEditable =
            target?.isContentEditable ||
            tagName === "INPUT" ||
            tagName === "TEXTAREA" ||
            tagName === "SELECT";
        if (isEditable) return;
        if (event.metaKey || event.ctrlKey) {
            event.preventDefault();
        }
        void refreshPosts();
    };

    const handleBannerClick = () => {
        void refreshPosts();
    };

    const handleFloatingRefresh = () => {
        void refreshPosts();
    };

    $: {
        const nextKey = `${$posts.length}:${$posts[0]?.id ?? ""}`;
        if (nextKey !== lastPostsKey) {
            pendingHasUpdates = false;
            pendingNewCount = 0;
            lastPostsKey = nextKey;
        }
    }

    $: if ($searchQuery !== lastSearch) {
        pendingHasUpdates = false;
        pendingNewCount = 0;
        lastSearch = $searchQuery;
    }

    onMount(() => {
        void loadPosts();
        updateLayout();
        window.addEventListener("resize", updateLayout);
        window.addEventListener("keydown", handleKeydown);
        pollTimer = setInterval(() => {
            void checkForUpdates();
        }, AUTO_REFRESH_MS);
        const handleVisibility = () => {
            if (!document.hidden) {
                void checkForUpdates();
            }
        };
        document.addEventListener("visibilitychange", handleVisibility);
        return () => {
            window.removeEventListener("resize", updateLayout);
            window.removeEventListener("keydown", handleKeydown);
            document.removeEventListener("visibilitychange", handleVisibility);
            if (pollTimer) {
                clearInterval(pollTimer);
            }
        };
    });
</script>

<div class="waterfall">
    <PostsGrid
        items={$posts}
        loading={$postsLoading}
        onSelect={openMessage}
        masonry={true}
        onScroll={handleScroll}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
    >
        <div slot="header" class="refresh-shell">
            <div class="pull-indicator" style={`height: ${pullDistance}px;`}>
                <div
                    class="pull-content"
                    class:ready={pullReady}
                    class:loading={pullRefreshing || $postsLoading}
                >
                    <svg
                        class="pull-icon"
                        viewBox="0 0 1024 1024"
                        width="16"
                        height="16"
                    >
                        <path
                            d="M512 160c-194.432 0-352 157.568-352 352s157.568 352 352 352c132.672 0 247.616-73.536 307.712-181.888l-61.952-33.792C706.56 724.992 614.144 784 512 784c-150.528 0-272-121.472-272-272s121.472-272 272-272c75.328 0 143.488 30.592 192.896 80H576v64h224V160l-58.592 58.592C676.992 184.96 597.056 160 512 160z"
                            fill="currentColor"
                        ></path>
                    </svg>
                    <span>
                        {pullRefreshing || $postsLoading
                            ? "刷新中..."
                            : pullReady
                              ? "松开刷新"
                              : "下拉刷新"}
                    </span>
                </div>
            </div>
            {#if pendingHasUpdates}
                <button
                    class="refresh-banner"
                    type="button"
                    on:click={handleBannerClick}
                >
                    {pendingNewCount > 0
                        ? `有 ${pendingNewCount} 条新内容，点击刷新`
                        : "内容有更新，点击刷新"}
                </button>
            {/if}
        </div>
    </PostsGrid>
    <button
        class="floating-refresh"
        type="button"
        on:click={handleFloatingRefresh}
        aria-label="刷新"
        title="刷新"
        disabled={$postsLoading}
    >
        <svg
            class="refresh-icon"
            class:spinning={$postsLoading}
            viewBox="0 0 1024 1024"
            width="20"
            height="20"
        >
            <path
                d="M512 160c-194.432 0-352 157.568-352 352s157.568 352 352 352c132.672 0 247.616-73.536 307.712-181.888l-61.952-33.792C706.56 724.992 614.144 784 512 784c-150.528 0-272-121.472-272-272s121.472-272 272-272c75.328 0 143.488 30.592 192.896 80H576v64h224V160l-58.592 58.592C676.992 184.96 597.056 160 512 160z"
                fill="currentColor"
            ></path>
        </svg>
        {#if pendingHasUpdates}
            <span class="floating-badge"></span>
        {/if}
    </button>
</div>

<style>
    .waterfall {
        display: flex;
        flex: 1;
        width: 100%;
        position: relative;
    }

    .refresh-shell {
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 100%;
    }

    .pull-indicator {
        width: 100%;
        height: 0;
        display: flex;
        justify-content: center;
        align-items: flex-end;
        overflow: hidden;
        transition: height 0.2s ease;
    }

    .pull-content {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 14px;
        margin-bottom: 8px;
        border-radius: 999px;
        border: 1px solid #222;
        background: rgba(0, 0, 0, 0.75);
        color: #cfcfcf;
        font-size: 12px;
        letter-spacing: 0.5px;
        pointer-events: none;
        transition:
            color 0.2s ease,
            border-color 0.2s ease;
    }

    .pull-content.ready {
        color: #a3c101;
        border-color: #a3c101;
    }

    .pull-content.loading {
        color: #fff;
    }

    .pull-icon {
        transform-origin: 50% 50%;
        transition: transform 0.2s ease;
    }

    .pull-content.ready .pull-icon {
        transform: rotate(180deg);
    }

    .pull-content.loading .pull-icon {
        animation: refreshSpin 0.8s linear infinite;
    }

    .refresh-banner {
        position: sticky;
        top: 0;
        margin: 6px auto 10px;
        padding: 6px 16px;
        border-radius: 999px;
        border: 2px solid #2a2a2a;
        background: #0b0b0b;
        color: #fff;
        font-size: 13px;
        cursor: pointer;
        pointer-events: auto;
        z-index: 3;
    }

    .refresh-banner:hover {
        background: #a3c101;
        color: #000;
        border-color: #a3c101;
    }

    .floating-refresh {
        position: fixed;
        right: 24px;
        bottom: 24px;
        width: 56px;
        height: 56px;
        border-radius: 50%;
        border: 2px solid #2a2a2a;
        background: #0b0b0b;
        color: #fff;
        display: none;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 8;
        box-shadow:
            0 16px 28px rgba(0, 0, 0, 0.38),
            0 6px 14px rgba(0, 0, 0, 0.28);
        transition:
            border-color 0.2s ease,
            color 0.2s ease;
    }

    .floating-refresh:hover {
        border-color: #a3c101;
        color: #000;
        animation: refreshBorderShift 1.5s alternate infinite;
        will-change: box-shadow, border-color;
    }

    .floating-refresh:hover .refresh-icon {
        transform: rotate(360deg);
    }

    .floating-refresh:disabled {
        cursor: not-allowed;
        opacity: 0.6;
        box-shadow: 0 12px 18px rgba(0, 0, 0, 0.25);
    }

    .refresh-icon {
        transform-origin: 50% 50%;
        transition: transform 0.35s ease;
    }

    .refresh-icon.spinning {
        animation: refreshSpin 0.8s linear infinite;
    }

    .floating-badge {
        position: absolute;
        top: 10px;
        right: 10px;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: #a3c101;
        box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.6);
    }

    @keyframes refreshSpin {
        from {
            transform: rotate(0deg);
        }

        to {
            transform: rotate(360deg);
        }
    }

    @keyframes refreshBorderShift {
        0% {
            border-color: #a3c101;
            background-color: #a3c101;
            box-shadow:
                0 16px 28px rgba(0, 0, 0, 0.38),
                0 6px 14px rgba(0, 0, 0, 0.28),
                0 0 0 0 #a3c101;
        }

        20% {
            box-shadow:
                0 16px 28px rgba(0, 0, 0, 0.38),
                0 6px 14px rgba(0, 0, 0, 0.28),
                0 0 0 1.5px #a3c101;
        }

        40% {
            box-shadow:
                0 16px 28px rgba(0, 0, 0, 0.38),
                0 6px 14px rgba(0, 0, 0, 0.28),
                0 0 0 0 #a3c101;
        }

        60% {
            box-shadow:
                0 16px 28px rgba(0, 0, 0, 0.38),
                0 6px 14px rgba(0, 0, 0, 0.28),
                0 0 0 1.5px #a3c101;
        }

        80% {
            box-shadow:
                0 16px 28px rgba(0, 0, 0, 0.38),
                0 6px 14px rgba(0, 0, 0, 0.28),
                0 0 0 0 #a3c101;
        }

        100% {
            border-color: #fffa00;
            background-color: #fffa00;
            box-shadow:
                0 16px 28px rgba(0, 0, 0, 0.38),
                0 6px 14px rgba(0, 0, 0, 0.28),
                0 0 0 1.5px #fffa00;
        }
    }

    @media (min-width: 501px) {
        .floating-refresh {
            display: flex;
        }

        .pull-indicator {
            display: none;
        }
    }

    @media (max-width: 500px) {
        .refresh-banner {
            margin-top: 4px;
        }
    }
</style>
