<script lang="ts">
  export let src: string | undefined;
  export let size = 40;
  export let style = '';

  let restProps: Record<string, unknown> = {};
  let className = '';
  let restStyle = '';

  $: {
    const { class: klass = '', style: inlineStyle = '', ...rest } = $$restProps;
    className = String(klass ?? '');
    restStyle = String(inlineStyle ?? '');
    restProps = rest;
  }
</script>

<div
  class={`avatar ${className}`}
  style={`--size: ${size}px; ${style} ${restStyle}`}
  {...restProps}
>
  {#if src}
    <img src={src} alt="" />
  {/if}
</div>

<style>
  .avatar {
    position: relative;
    flex-shrink: 0;
    width: var(--size, 40px);
    height: var(--size, 40px);
    border-radius: 50%;
    background-color: #a5a3a6;
  }

  .avatar::before {
    content: '';
    position: absolute;
    top: -3px;
    right: -3px;
    bottom: -3px;
    left: -3px;
    border: 3px solid #302e31;
    border-radius: 50%;
  }

  .avatar.following::before {
    border-color: #2fbf5b;
  }

  .avatar img {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background-color: #a5a3a6;
    object-fit: contain;
  }
</style>
