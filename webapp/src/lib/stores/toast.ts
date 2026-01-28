import { writable } from 'svelte/store';

type ToastState = {
  message: string;
};

export const toast = writable<ToastState | null>(null);

let hideTimer: ReturnType<typeof setTimeout> | null = null;

export const showToast = (message: string, duration = 1800) => {
  toast.set({ message });
  if (hideTimer) {
    clearTimeout(hideTimer);
  }
  hideTimer = setTimeout(() => {
    toast.set(null);
    hideTimer = null;
  }, duration);
};
