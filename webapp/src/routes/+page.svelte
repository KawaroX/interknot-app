<script lang="ts">
  import PageShell from '$lib/components/PageShell.svelte';
  import Loading from '$lib/components/Loading.svelte';
  import PopupLayer from '$lib/components/PopupLayer.svelte';
  import Waterfall from '$lib/components/Waterfall.svelte';
</script>

<PageShell>
  <Waterfall />
</PageShell>
<PopupLayer />
<Loading />
