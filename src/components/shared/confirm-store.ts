import { create } from 'zustand';

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

interface ConfirmState extends ConfirmOptions {
  open: boolean;
  resolve: ((value: boolean) => void) | null;
  ask: (opts: ConfirmOptions) => Promise<boolean>;
  settle: (value: boolean) => void;
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  open: false,
  title: '',
  resolve: null,
  ask: (opts) =>
    new Promise<boolean>((resolve) => {
      set({ ...opts, open: true, resolve });
    }),
  settle: (value) => {
    get().resolve?.(value);
    set({ open: false, resolve: null });
  },
}));

/** 命令式确认框，替代浏览器原生 window.confirm（iframe 中常被拦截）。 */
export function confirmAction(opts: ConfirmOptions): Promise<boolean> {
  return useConfirmStore.getState().ask(opts);
}
