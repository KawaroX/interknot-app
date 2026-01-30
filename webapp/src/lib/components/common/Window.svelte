<script lang="ts">
    export let title = "";
    export let height = "70%";
    export let variant = "";
    export let onClose: () => void = () => {};

    const handleBackdrop = () => {
        onClose?.();
    };
</script>

<div
    class="window-view"
    role="button"
    tabindex="0"
    aria-label="关闭弹窗"
    on:click={handleBackdrop}
    on:keydown={(event) => {
        if (event.key === "Escape" || event.key === "Enter") {
            onClose();
        }
    }}
>
    <div
        class={`window ${variant}`}
        role="presentation"
        tabindex="-1"
        style={`--window-height: ${height}`}
        on:click|stopPropagation
        on:keydown|stopPropagation={() => {}}
    >
        <div class="header">
            <div class="title">
                <slot name="header">{title}</slot>
            </div>
            <div class="header-actions">
                <slot name="header-actions" />
            </div>
            <button
                class="close"
                type="button"
                aria-label="关闭"
                on:click={onClose}
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 201 130"
                    width="55"
                >
                    <path
                        fill-rule="evenodd"
                        fill="rgb(196, 34, 9)"
                        d="M0.373,65.000 C0.087,51.609 3.792,38.466 11.131,27.293 C19.671,14.293 32.558,4.832 47.439,0.360 C90.023,0.360 132.606,0.360 175.190,0.360 C183.245,1.482 190.671,5.694 195.361,12.480 C201.498,21.357 202.014,33.317 196.706,43.453 C185.052,65.000 173.397,86.547 161.743,108.094 C156.410,114.144 150.041,119.160 142.916,122.907 C136.598,126.230 129.798,128.498 122.745,129.640 C99.884,129.640 77.024,129.640 54.163,129.640 C38.778,126.247 24.988,117.749 15.165,105.400 C6.284,94.236 0.695,80.120 0.373,65.000 ZM51.473,11.133 L171.156,11.133 C175.707,11.408 180.022,13.285 183.259,16.520 C187.160,20.420 189.059,25.857 188.637,31.333 C177.880,52.431 167.122,73.529 156.364,94.627 C152.903,101.201 147.810,106.769 141.571,110.787 C135.517,114.686 128.583,116.999 121.400,117.520 C98.988,117.520 76.575,117.520 54.163,117.520 C28.223,111.309 10.366,87.869 11.131,62.307 C11.831,38.916 28.017,17.942 51.473,11.133 ZM54.538,17.998 C91.618,17.954 128.697,17.910 165.777,17.866 C171.772,16.637 177.788,19.453 180.569,24.600 C183.069,29.227 182.591,35.067 179.224,39.413 C168.466,58.716 157.708,78.018 146.950,97.320 C144.417,101.017 141.229,104.211 137.537,106.747 C133.865,109.270 129.766,111.094 125.434,112.134 C102.574,112.134 79.713,112.134 56.852,112.134 C33.925,106.570 18.183,85.813 18.891,63.215 C19.538,42.562 33.826,24.045 54.538,17.998 ZM79.713,63.653 C74.334,58.267 68.955,52.880 63.576,47.493 C60.994,44.908 60.994,40.652 63.576,38.066 C66.158,35.481 70.407,35.481 72.989,38.066 C78.368,43.453 83.747,48.840 89.126,54.227 C94.505,48.840 99.884,43.453 105.263,38.066 C107.957,36.746 111.211,37.289 113.332,39.413 C115.452,41.537 115.995,44.796 114.676,47.493 C109.297,52.880 103.918,58.267 98.539,63.653 C103.918,69.040 109.297,74.427 114.676,79.813 C117.258,82.399 117.258,86.654 114.676,89.240 C112.094,91.826 107.845,91.826 105.263,89.240 C99.884,83.853 94.505,78.467 89.126,73.080 C83.299,78.916 77.472,84.751 71.645,90.587 C68.951,91.907 65.697,91.364 63.576,89.240 C61.455,87.118 60.912,83.865 62.231,81.169 C68.058,75.333 73.886,69.493 79.713,63.653 Z"
                    />
                </svg>
            </button>
        </div>
        <div class="content">
            <slot />
        </div>
        <div class="footer">
            <slot name="footer" />
        </div>
    </div>
</div>

<style>
    .window-view {
        position: fixed;
        top: 0;
        left: 0;
        z-index: 20;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100vw;
        height: 100vh;
        height: 100dvh;
    }

    .window {
        position: relative;
        overflow: hidden;
        width: 70%;
        max-width: 1000px;
        border: 4px solid rgba(100, 100, 100, 0.2);
        border-radius: 20px 5px 20px 20px;
        background-color: #000;
        background-clip: padding-box;
    }

    .window::before {
        content: "";
        display: block;
        margin-top: var(--window-height);
    }

    .header {
        position: absolute;
        top: 0;
        left: 0;
        display: flex;
        align-items: center;
        width: 100%;
        height: 70px;
        padding: 10px 20px;
    }

    .title {
        color: #fff;
        font-size: 20px;
    }

    .header-actions {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-left: auto;
    }

    .close {
        margin-left: 12px;
        cursor: pointer;
        background: transparent;
        border: none;
        padding: 0;
    }

    .close svg {
        transform-origin: center;
    }

    .close:hover svg {
        animation: closePulse 1.5s alternate infinite;
    }

    .close:hover path {
        animation: closeColor 1.5s alternate infinite;
    }

    @keyframes closePulse {
        0% {
            transform: scale(1);
        }

        20% {
            transform: scale(1.05);
        }

        40% {
            transform: scale(1);
        }

        60% {
            transform: scale(1.05);
        }

        80% {
            transform: scale(1);
        }

        100% {
            transform: scale(1.05);
        }
    }

    .content {
        position: absolute;
        top: 70px;
        right: 5px;
        bottom: 70px;
        left: 5px;
        display: flex;
        padding: 15px 15px;
        border-radius: 5px;
        background-color: #111;
    }

    .footer {
        position: absolute;
        right: 0;
        bottom: 0;
        left: 0;
        pointer-events: none;
    }

    .footer > :global(*) {
        pointer-events: auto;
    }

    @media screen and (min-width: 500px) and (max-width: 1000px) {
        .window {
            width: 90%;
        }
    }

    @keyframes closeColor {
        0% {
            fill: #a3c101;
        }

        100% {
            fill: #fffa00;
        }
    }

    @media screen and (max-width: 700px) and (max-aspect-ratio: 1 / 1) {
        .window {
            width: 90%;
            height: 87%;
            max-height: calc(100dvh - 40px);
        }

        .window::before {
            content: none;
        }

        .content {
            display: flex;
            flex-direction: column;
            overflow-x: hidden;
            overflow-y: auto;
            min-height: 0;
        }
    }
</style>
