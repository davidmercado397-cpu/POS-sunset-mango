import clsx from 'clsx';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useEffect } from 'react';
import { create } from 'zustand';

interface ToastItem {
  id: number;
  message: string;
  tone: 'success' | 'error';
}

const useToasts = create<{ items: ToastItem[]; push: (t: Omit<ToastItem, 'id'>) => void; remove: (id: number) => void }>((set) => ({
  items: [],
  push: (t) => set((s) => ({ items: [...s.items, { ...t, id: Date.now() + Math.random() }] })),
  remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}));

export const toast = {
  success: (message: string) => useToasts.getState().push({ message, tone: 'success' }),
  error: (err: unknown) =>
    useToasts.getState().push({ message: err instanceof Error ? err.message : String(err), tone: 'error' }),
};

export function Toaster() {
  const items = useToasts((s) => s.items);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4">
      {items.map((t) => (
        <ToastView key={t.id} item={t} />
      ))}
    </div>
  );
}

function ToastView({ item }: { item: ToastItem }) {
  const remove = useToasts((s) => s.remove);
  useEffect(() => {
    const timer = setTimeout(() => remove(item.id), item.tone === 'error' ? 5000 : 2500);
    return () => clearTimeout(timer);
  }, [item, remove]);
  return (
    <div
      role="status"
      onClick={() => remove(item.id)}
      className={clsx(
        'pointer-events-auto flex max-w-md items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium shadow-lg',
        item.tone === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white',
      )}
    >
      {item.tone === 'success' ? <CheckCircle2 className="size-5 shrink-0" /> : <XCircle className="size-5 shrink-0" />}
      {item.message}
    </div>
  );
}
