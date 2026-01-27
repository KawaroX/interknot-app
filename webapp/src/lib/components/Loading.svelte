<script lang="ts">
  import { loading } from '$lib/stores/ui';
</script>

{#if $loading}
  <div class="loading">
    <div class="loading__animation"></div>
  </div>
{/if}

<style>
  .loading {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 999;
    display: flex;
    justify-content: center;
    align-items: center;
    background-color: #fff;
    color: #fff;
    user-select: none;
  }

  .loading__animation {
    position: absolute;
    right: 15px;
    bottom: 15px;
    width: 300px;
    height: 85px;
    background-image: url('/images/loading-sprite.webp');
    background-position: 0 0;
    background-size: 100% 3000%;
    animation: loadingLoop 0.5s steps(30) infinite forwards;
  }

  @keyframes loadingLoop {
    0% {
      background-position: 0 0;
    }

    100% {
      background-position: 0 -3000%;
    }
  }
</style>
