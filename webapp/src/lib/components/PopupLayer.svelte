<script lang="ts">
  import { onMount } from 'svelte';
  import MessagePopup from '$lib/components/popup/Message.svelte';
  import ComposePopup from '$lib/components/popup/Compose.svelte';
  import ImageViewer from '$lib/components/popup/ImageViewer.svelte';
  import ConfirmPopup from '$lib/components/popup/Confirm.svelte';
  import { popup, closePopup } from '$lib/stores/popup';

  onMount(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closePopup();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });
</script>

{#if $popup?.type === 'message'}
  <MessagePopup postId={$popup.messageId} />
{:else if $popup?.type === 'compose'}
  <ComposePopup post={$popup.post ?? null} />
{:else if $popup?.type === 'image'}
  <ImageViewer src={$popup.src} />
{:else if $popup?.type === 'confirm'}
  <ConfirmPopup />
{/if}
