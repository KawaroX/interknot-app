import { writable } from 'svelte/store';

export type ReportRequest = {
  type: 'post';
  postId: string;
};

export const pendingReport = writable<ReportRequest | null>(null);

export const requestPostReport = (postId: string) => {
  pendingReport.set({ type: 'post', postId });
};

export const clearPendingReport = () => {
  pendingReport.set(null);
};
