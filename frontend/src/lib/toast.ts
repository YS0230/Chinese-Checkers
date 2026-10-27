import { useSyncExternalStore } from 'react';

export type ToastKind = 'info' | 'success' | 'error' | 'warning';
export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

let toasts: Toast[] = [];
let seq = 1;
const subs = new Set<() => void>();
const emit = () => subs.forEach((s) => s());

export function toast(text: string, kind: ToastKind = 'info', ms = 3200): void {
  const id = seq++;
  toasts = [...toasts.slice(-3), { id, kind, text }];
  emit();
  setTimeout(() => dismissToast(id), ms);
}

export function dismissToast(id: number): void {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => toasts,
    () => toasts,
  );
}
