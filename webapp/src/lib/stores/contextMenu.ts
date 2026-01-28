import { writable } from 'svelte/store';

export type ContextMenuItem = {
  label: string;
  action: () => void | Promise<void>;
  disabled?: boolean;
  danger?: boolean;
};

export type ContextMenuState = {
  x: number;
  y: number;
  items: ContextMenuItem[];
};

export const contextMenu = writable<ContextMenuState | null>(null);

export const openContextMenu = (state: ContextMenuState) => {
  contextMenu.set(state);
};

export const closeContextMenu = () => {
  contextMenu.set(null);
};
