<script lang="ts">
  import { fade } from 'svelte/transition';
  import { toast } from '$lib/stores/toast';
</script>

{#if $toast}
  <div class="toast" transition:fade={{ duration: 160 }}>
    {$toast.message}
  </div>
{/if}

<style>
  .toast {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 60;
    padding: 10px 18px;
    border-radius: 999px;
    border: 2px solid #a3c101;
    background: rgba(0, 0, 0, 0.82);
    color: #fff;
    font-size: 14px;
    letter-spacing: 0.5px;
    box-shadow:
      0 16px 28px rgba(0, 0, 0, 0.4),
      0 6px 14px rgba(0, 0, 0, 0.3);
    pointer-events: none;
    text-align: center;
    max-width: min(80vw, 360px);
  }
</style>
