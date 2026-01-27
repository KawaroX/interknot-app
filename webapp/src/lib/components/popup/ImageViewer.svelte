<script lang="ts">
  import { fade } from 'svelte/transition';
  import Window from '$lib/components/common/Window.svelte';
  import { closePopup } from '$lib/stores/popup';

  export let src: string;
</script>

<div class="popup-shell" transition:fade={{ duration: 100 }}>
  <Window variant="image-viewer" title="查看图片" onClose={closePopup}>
    <div class="viewer">
      <img src={src} alt="" />
    </div>
  </Window>
</div>

<style>
  :global(.image-viewer .content) {
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: #0b0b0b;
  }

  .viewer {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }

  .viewer img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    border-radius: 12px;
  }
</style>
