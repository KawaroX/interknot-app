<script lang="ts">
    import { browser } from "$app/environment";
    import Card from "$lib/components/waterfall/Card.svelte";
    import type { PostSummary } from "$lib/types";

    export let items: PostSummary[] = [];
    export let loading = false;
    export let emptyText = "什么都没有";
    export let onSelect: (id: string) => void = () => {};
    export let showDelete = false;
    export let onDelete: (id: string) => void = () => {};
    export let masonry = false;
    export let onScroll: (event: Event) => void = () => {};
    export let onTouchStart: (event: TouchEvent) => void = () => {};
    export let onTouchMove: (event: TouchEvent) => void = () => {};
    export let onTouchEnd: (event: TouchEvent) => void = () => {};

    let gridElement: HTMLDivElement | null = null;

    const masonryItem = (node: HTMLElement, active: boolean) => {
        if (!browser) return;
        let observer: ResizeObserver | null = null;

        const updateSpan = () => {
            if (!active || !gridElement) return;
            const styles = getComputedStyle(gridElement);
            const rowHeight =
                parseFloat(styles.getPropertyValue("grid-auto-rows")) || 0;
            const rowGap = parseFloat(styles.getPropertyValue("row-gap")) || 0;
            const columnGap =
                parseFloat(styles.getPropertyValue("column-gap")) || 0;
            const gap = rowGap || columnGap;
            if (!rowHeight) return;
            const height = node.getBoundingClientRect().height;
            const span = Math.ceil((height + gap) / (rowHeight + gap));
            node.style.gridRowEnd = `span ${span}`;
        };

        const setup = () => {
            if (!active) return;
            observer = new ResizeObserver(() => updateSpan());
            observer.observe(node);
            requestAnimationFrame(updateSpan);
        };

        const teardown = () => {
            observer?.disconnect();
            observer = null;
            node.style.gridRowEnd = "";
        };

        setup();

        return {
            update(nextActive: boolean) {
                if (nextActive === active) {
                    requestAnimationFrame(updateSpan);
                    return;
                }
                active = nextActive;
                teardown();
                if (active) {
                    setup();
                }
            },
            destroy() {
                teardown();
            },
        };
    };
</script>

<div
    class="grid-shell"
    on:scroll={onScroll}
    on:touchstart={onTouchStart}
    on:touchmove|nonpassive={onTouchMove}
    on:touchend={onTouchEnd}
>
    <slot name="header" />
    {#if loading}
        <div class="empty-list">
            <img src="/images/loading-sprite.webp" alt="" />
            <span>加载中...</span>
        </div>
    {:else if items.length > 0}
        <div class="grid" class:masonry bind:this={gridElement}>
            {#each items as item (item.id)}
                <div class="grid-item" use:masonryItem={masonry}>
                    <Card
                        post={item}
                        {showDelete}
                        on:select={() => onSelect(item.id)}
                        on:delete={() => onDelete(item.id)}
                    />
                </div>
            {/each}
        </div>
    {:else}
        <div class="empty-list">
            <img src="/images/empty.webp" alt="" />
            <span>{emptyText}</span>
        </div>
    {/if}
</div>

<style>
    .grid-shell {
        flex: 1;
        overflow: scroll;
        width: 100%;
        border-radius: 10px;
    }

    .grid {
        --grid-gap: 5px;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: var(--grid-gap);
        align-items: start;
        padding: var(--grid-gap);
    }

    @media (max-width: 300px) {
        .grid {
            grid-template-columns: 1fr;
        }
    }

    @media (min-width: 301px) and (max-width: 500px) {
        .grid {
            --grid-gap: 2.5px;
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }
    }

    @media (min-width: 551px) and (max-width: 690px) {
        .grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
        }
    }

    .grid.masonry {
        grid-auto-rows: 1px;
        grid-auto-flow: dense;
    }

    .empty-list {
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        width: 100%;
        height: 80%;
        color: #666;
        text-align: center;
        font-size: 20px;
        user-select: none;
    }

    .empty-list img {
        max-width: 300px;
    }
</style>
