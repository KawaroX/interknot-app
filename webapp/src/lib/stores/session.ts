import { writable } from 'svelte/store';
import type { RecordModel } from 'pocketbase';
import { pb } from '$lib/api/pb';

const initial = pb.authStore.model as RecordModel | null;

export const session = writable<RecordModel | null>(initial);

pb.authStore.onChange(() => {
  session.set(pb.authStore.model as RecordModel | null);
});

export const logout = async () => {
  pb.authStore.clear();
  session.set(null);
};
