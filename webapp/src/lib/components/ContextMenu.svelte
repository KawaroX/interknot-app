<script lang="ts">
  import { onMount, tick } from 'svelte';
  import {
    closeContextMenu,
    contextMenu,
    type ContextMenuItem,
  } from '$lib/stores/contextMenu';

  let menuElement: HTMLDivElement | null = null;
  let left = 0;
  let top = 0;

  const adjustPosition = async () => {
    await tick();
    if (!$contextMenu || !menuElement) return;
    const rect = menuElement.getBoundingClientRect();
    const padding = 12;
    const maxLeft = window.innerWidth - rect.width - padding;
    const maxTop = window.innerHeight - rect.height - padding;
    left = Math.max(padding, Math.min($contextMenu.x, maxLeft));
    top = Math.max(padding, Math.min($contextMenu.y, maxTop));
  };

  const handleItem = (item: ContextMenuItem) => {
    if (item.disabled) return;
    closeContextMenu();
    void item.action();
  };

  $: if ($contextMenu) {
    left = $contextMenu.x;
    top = $contextMenu.y;
    void adjustPosition();
  }

  onMount(() => {
    const shouldIgnoreClose = (event: Event) => {
      if (!menuElement) return false;
      const target = event.target;
      return target instanceof Node && menuElement.contains(target);
    };
    const closeOnPointerDown = (event: PointerEvent) => {
      if (shouldIgnoreClose(event)) return;
      closeContextMenu();
    };
    const closeOnClick = (event: MouseEvent) => {
      if (shouldIgnoreClose(event)) return;
      closeContextMenu();
    };
    const closeOnContextMenu = (event: MouseEvent) => {
      if (shouldIgnoreClose(event)) return;
      closeContextMenu();
    };
    const pointerOptions = { capture: true } as const;
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeContextMenu();
      }
    };
    window.addEventListener('click', closeOnClick);
    window.addEventListener('pointerdown', closeOnPointerDown, pointerOptions);
    window.addEventListener('contextmenu', closeOnContextMenu);
    window.addEventListener('resize', closeContextMenu);
    window.addEventListener('scroll', closeContextMenu, true);
    window.addEventListener('keydown', handleKeydown);
    return () => {
      window.removeEventListener('click', closeOnClick);
      window.removeEventListener('pointerdown', closeOnPointerDown, pointerOptions);
      window.removeEventListener('contextmenu', closeOnContextMenu);
      window.removeEventListener('resize', closeContextMenu);
      window.removeEventListener('scroll', closeContextMenu, true);
      window.removeEventListener('keydown', handleKeydown);
    };
  });
</script>

{#if $contextMenu}
  <div
    class="menu"
    style={`left: ${left}px; top: ${top}px;`}
    bind:this={menuElement}
    role="menu"
    on:click|stopPropagation
    on:contextmenu|preventDefault
  >
    {#each $contextMenu.items as item}
      <button
        class="item"
        class:danger={item.danger}
        disabled={item.disabled}
        on:click={() => handleItem(item)}
        type="button"
        role="menuitem"
      >
        {item.label}
      </button>
    {/each}
  </div>
{/if}

<style>
  .menu {
    position: fixed;
    z-index: 40;
    display: flex;
    flex-direction: column;
    min-width: 180px;
    padding: 8px;
    border-radius: 14px;
    border: 2px solid #2a2a2a;
    background: rgba(10, 10, 10, 0.98);
    box-shadow:
      0 12px 30px rgba(0, 0, 0, 0.5),
      0 6px 14px rgba(0, 0, 0, 0.35);
    backdrop-filter: blur(12px);
  }

  .item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border: none;
    border-radius: 10px;
    background: transparent;
    color: #e6e6e6;
    font-size: 13px;
    text-align: left;
    cursor: pointer;
  }

  .item:disabled {
    cursor: default;
    opacity: 0.5;
  }

  .item:hover:not(:disabled) {
    background: #a3c101;
    color: #000;
  }

  .item.danger {
    color: #ff7b7b;
  }

  .item.danger:hover:not(:disabled) {
    background: #c23a2b;
    color: #fff;
  }
</style>
