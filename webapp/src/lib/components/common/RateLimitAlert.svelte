<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { fade } from 'svelte/transition';

  export let title = '';
  export let message = '';
  export let retryAfter = 0;
  export let onClose: () => void = () => {};

  let countdown = retryAfter;
  let timer: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    if (countdown > 0) {
      timer = setInterval(() => {
        countdown = Math.max(0, countdown - 1);
        if (countdown === 0 && timer) {
          clearInterval(timer);
          timer = null;
        }
      }, 1000);
    }
  });

  onDestroy(() => {
    if (timer) {
      clearInterval(timer);
    }
  });
</script>

<div class="overlay" transition:fade={{ duration: 150 }} on:click|self={onClose}>
  <div class="alert">
    <h3>{title}</h3>
    <p>{message}</p>
    {#if countdown > 0}
      <div class="countdown">
        请等待 <span class="time">{countdown}</span> 秒后重试
      </div>
    {/if}
    <button type="button" on:click={onClose}>我知道了</button>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(2px);
  }

  .alert {
    width: min(300px, 80vw);
    padding: 24px;
    background: #111;
    border: 2px solid #333;
    border-radius: 16px;
    text-align: center;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
  }

  h3 {
    margin: 0 0 12px;
    color: #ff5555;
    font-size: 18px;
  }

  p {
    margin: 0 0 16px;
    color: #ccc;
    font-size: 14px;
    line-height: 1.5;
  }

  .countdown {
    margin-bottom: 20px;
    font-size: 13px;
    color: #888;
  }

  .time {
    color: #a3c101;
    font-weight: bold;
    font-variant-numeric: tabular-nums;
  }

  button {
    width: 100%;
    padding: 10px;
    border: none;
    border-radius: 999px;
    background: #333;
    color: #fff;
    font-size: 14px;
    cursor: pointer;
    transition: background 0.2s;
  }

  button:hover {
    background: #444;
  }
</style>
