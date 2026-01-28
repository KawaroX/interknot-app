<script lang="ts">
  import '../app.css';
  import ContextMenu from '$lib/components/ContextMenu.svelte';
  import Toast from '$lib/components/Toast.svelte';
</script>

<slot />
<Toast />
<ContextMenu />
