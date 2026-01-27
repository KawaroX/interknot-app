<script lang="ts">
    import { fade } from "svelte/transition";
    import Window from "$lib/components/common/Window.svelte";
    import { characters } from "$lib/data/characters";
    import { closePopup } from "$lib/stores/popup";

    const highlightId = 1;
</script>

<div class="popup-shell" transition:fade={{ duration: 100 }}>
    <Window variant="select-window" title="更换角色" onClose={closePopup}>
        <div class="scroll-view">
            {#each characters as item}
                <button
                    class="character"
                    class:highlight={item.id === highlightId}
                    type="button"
                >
                    <div class="avatar">
                        <img src={item.avatar} alt="" />
                    </div>
                    <div class="name">{item.name}</div>
                </button>
            {/each}
        </div>
        <svelte:fragment slot="footer">
            <div class="add">新角色</div>
        </svelte:fragment>
    </Window>
</div>

<style>
    :global(.select-window:hover .add) {
        opacity: 1;
        transform: translate(-50%, 0);
    }

    :global(.select-window .content) {
        padding: 0 15px !important;
    }

    .scroll-view {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        align-content: flex-start;
        overflow: scroll;
        padding: 10px 0;
        width: 100%;
    }

    .character {
        position: relative;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        overflow: hidden;
        box-sizing: border-box;
        margin: 1%;
        padding: 10px;
        width: 18%;
        border: 2px solid transparent;
        border-radius: 20px;
        cursor: pointer;
        transition: 0.3s;
        user-select: none;
        background: transparent;
        color: inherit;
        appearance: none;
    }

    .character:hover {
        border-color: #a3c101;
    }

    .avatar {
        position: relative;
        box-sizing: border-box;
        padding-bottom: 100%;
        width: 100%;
        border: 2px solid #999;
        border-radius: 50%;
    }

    .avatar img {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        border-radius: 50%;
        background-color: #666;
        object-fit: contain;
    }

    .name {
        overflow: hidden;
        margin-top: 10px;
        width: 100%;
        height: 20px;
        color: #fff;
        text-align: center;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 16px;
    }

    .add {
        position: absolute;
        bottom: 10px;
        left: 50%;
        display: flex;
        justify-content: center;
        align-items: center;
        box-sizing: border-box;
        padding: 5px 15px;
        height: 35px;
        border: 4px solid #313131;
        border-radius: 15px;
        background-color: #000;
        color: #fff;
        opacity: 0;
        cursor: pointer;
        transition: 0.2s;
        transform: translate(-50%, 50%);
    }

    .add:hover {
        border-color: #a3c101;
        background-color: #a3c101;
        color: #000;
        opacity: 1;
        transform: translate(-50%, 0);
    }

    .highlight {
        background-color: #a3c101;
    }

    .highlight .name {
        color: #000;
    }

    @media screen and (max-width: 500px) {
        .character {
            width: 31%;
        }
    }

    @media screen and (min-width: 1200px) {
        .character {
            width: 12%;
        }
    }

    @media screen and (max-width: 700px) and (max-aspect-ratio: 1 / 1) {
        .add {
            opacity: 1;
            transform: translate(-50%, 0);
        }
    }
</style>
