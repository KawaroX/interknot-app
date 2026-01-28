import { get, writable } from 'svelte/store';
import type { PostSummary } from '$lib/types';
import { clearSelectedCard } from '$lib/stores/cardTransition';

export type PopupState =
  | { type: 'message'; messageId: string }
  | { type: 'compose'; post?: PostSummary }
  | { type: 'select' }
  | { type: 'image'; src: string; returnTo: PopupState | null }
  | {
      type: 'confirm';
      title: string;
      message: string;
      onConfirm: () => void;
      onCancel?: () => void;
    };

export const popup = writable<PopupState | null>(null);

export const openMessage = (messageId: string) => {
  popup.set({ type: 'message', messageId });
};

export const openCompose = (post?: PostSummary) => {
  popup.set({ type: 'compose', post });
};

export const openSelect = () => {
  popup.set({ type: 'select' });
};

export const openConfirm = (
  title: string,
  message: string,
  onConfirm: () => void,
  onCancel?: () => void
) => {
  popup.set({ type: 'confirm', title, message, onConfirm, onCancel });
};

export const openImage = (src: string) => {
  const current = get(popup);
  const returnTo = current && current.type === 'image' ? current.returnTo : current;
  popup.set({ type: 'image', src, returnTo });
};

export const closePopup = () => {
  const current = get(popup);
  
  if (current?.type === 'image' && current.returnTo) {
    popup.set(current.returnTo);
    return;
  }

  clearSelectedCard();
  popup.set(null);
};
