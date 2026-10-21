// Transient notices. Licensed under GPL-3.0.
import { createStore } from '../core/store';

export const toastStore = createStore<string | null>(null);
let timer: ReturnType<typeof setTimeout> | undefined;

export function toast(text: string, ms = 2600): void {
  clearTimeout(timer);
  toastStore.set(text);
  timer = setTimeout(() => toastStore.set(null), ms);
}
