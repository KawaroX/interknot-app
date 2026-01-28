import { crossfade } from 'svelte/transition';
import { cubicOut } from 'svelte/easing';
import { writable } from 'svelte/store';

// 创建 crossfade 动画对
const [send, receive] = crossfade({
  duration: 380,
  easing: cubicOut,
  fallback(node) {
    const style = getComputedStyle(node);
    const transform = style.transform === 'none' ? '' : style.transform;
    return {
      duration: 300,
      easing: cubicOut,
      css: (t) => `
        transform: ${transform} translateX(${(1 - t) * -24}px);
        opacity: ${t}
      `,
    };
  },
});

export { send, receive };

// 当前选中的卡片ID，用于在列表中隐藏对应卡片
export const selectedCardId = writable<string | null>(null);

export const setSelectedCard = (id: string) => {
  selectedCardId.set(id);
};

export const clearSelectedCard = () => {
  selectedCardId.set(null);
};
