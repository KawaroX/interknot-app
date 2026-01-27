<script lang="ts">
  import Header from '$lib/components/Header.svelte';
  import { popup } from '$lib/stores/popup';
</script>

<div class="shell" role="presentation" on:contextmenu|preventDefault>
  <Header />
  <div class="body">
    <slot />
  </div>
  {#if $popup}
    <div class="mask"></div>
  {/if}
</div>

<style>
  .shell {
    display: flex;
    flex-direction: column;
    margin: 0 10px;
    width: calc(100vw - 20px);
    max-width: 1280px;
    height: 100vh;
  }

  .body {
    display: flex;
    flex: 1;
    width: 100%;
    border-radius: 10px;
  }

  .mask {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 5;
    pointer-events: none;
  }

  .mask::before {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: -2;
    background-color: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(2px);
  }

  .mask::after {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: -1;
    background: linear-gradient(
      45deg,
      rgba(255, 255, 255, 0.1) 0,
      rgba(255, 255, 255, 0.1) 25%,
      transparent 25%,
      transparent 50%,
      rgba(255, 255, 255, 0.1) 50%,
      rgba(255, 255, 255, 0.1) 75%,
      transparent 75%,
      transparent
    );
    background-size: 8px 8px;
    opacity: 0.5;
  }
</style>
