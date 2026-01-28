<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import PageShell from '$lib/components/PageShell.svelte';
  import Loading from '$lib/components/Loading.svelte';
  import PopupLayer from '$lib/components/PopupLayer.svelte';
  import Waterfall from '$lib/components/Waterfall.svelte';
  import { openMessage } from '$lib/stores/popup';

  let lastPostId = '';

  const cleanPostQuery = async (url: URL) => {
    const nextParams = new URLSearchParams(url.searchParams);
    nextParams.delete('post');
    const search = nextParams.toString();
    const nextUrl = `${url.pathname}${search ? `?${search}` : ''}${url.hash}`;
    await goto(nextUrl, { replaceState: true, noScroll: true, keepFocus: true });
  };

  const openFromQuery = (url: URL) => {
    const postId = url.searchParams.get('post');
    if (!postId) {
      lastPostId = '';
      return;
    }
    if (postId === lastPostId) return;
    lastPostId = postId;
    openMessage(postId);
    void cleanPostQuery(url);
  };

  onMount(() => {
    if (!browser) return;
    const unsubscribe = page.subscribe(($page) => {
      openFromQuery($page.url);
    });
    return () => unsubscribe();
  });
</script>

<PageShell>
  <Waterfall />
</PageShell>
<PopupLayer />
<Loading />
