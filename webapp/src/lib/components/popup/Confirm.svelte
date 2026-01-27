<script lang="ts">
  import { fade } from 'svelte/transition';
  import { popup, closePopup } from '$lib/stores/popup';

  $: config = $popup?.type === 'confirm' ? $popup : null;

  const handleConfirm = () => {
    config?.onConfirm();
    closePopup();
  };

  const handleCancel = () => {
    config?.onCancel?.();
    closePopup();
  };

  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      handleCancel();
    }
  };
</script>

<div
  class="confirm-overlay"
  role="button"
  tabindex="0"
  transition:fade={{ duration: 120 }}
  on:click={handleCancel}
  on:keydown={handleKeydown}
>
  <div
    class="confirm-panel"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    on:click|stopPropagation
    on:keydown|stopPropagation
  >
    <div class="confirm-title">{config?.title ?? '确认'}</div>
    <div class="confirm-message">{config?.message}</div>
    <div class="confirm-actions">
      <button type="button" class="confirm-btn cancel" on:click={handleCancel}>
        取消
      </button>
      <button type="button" class="confirm-btn primary" on:click={handleConfirm}>
        确定
      </button>
    </div>
  </div>
</div>

<style>
  .confirm-overlay {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(0, 0, 0, 0.75);
  }

  .confirm-panel {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: min(400px, 90vw);
    border: 2px solid #2a2a2a;
    border-radius: 18px;
    background: #0b0b0b;
    padding: 24px;
    color: #e6e6e6;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
  }

  .confirm-title {
    font-size: 20px;
    font-weight: bold;
    color: #fff;
  }

  .confirm-message {
    font-size: 15px;
    color: #ccc;
    line-height: 1.5;
  }

  .confirm-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 8px;
  }

  .confirm-btn {
    border: none;
    border-radius: 12px;
    padding: 10px 20px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s;
  }

  .confirm-btn.cancel {
    background: #2b2b2b;
    color: #d0d0d0;
  }

  .confirm-btn.cancel:hover {
    background: #3b3b3b;
    color: #fff;
  }

  .confirm-btn.primary {
    background: #a3c101;
    color: #000;
    font-weight: bold;
  }

  .confirm-btn.primary:hover {
    filter: brightness(1.1);
  }
</style>
