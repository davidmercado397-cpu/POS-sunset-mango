import clsx from 'clsx';
import { Minus, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Modal } from '../Modal';
import { ProductImage } from '../ProductImage';
import { Button, Input, Textarea } from '../ui';
import { formatCOP } from '../../lib/format';
import type { Menu, MenuOption, MenuProduct } from './types';

/** Cuadrícula de productos con foto, filtro por categoría y buscador. */
export function ProductPicker({ menu, onAdd }: { menu: Menu; onAdd: (p: MenuProduct, options: MenuOption[], quantity: number, notes: string) => void }) {
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<MenuProduct | null>(null);
  const colors = useMemo(() => new Map(menu.categories.map((c) => [c.id, c.color])), [menu.categories]);

  const products = useMemo(() => {
    const q = search.trim().toLowerCase();
    return menu.products.filter(
      (p) => (category === 'all' || p.categoryId === category) && (!q || p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q)),
    );
  }, [menu.products, category, search]);

  const pick = (p: MenuProduct) => (p.modifierGroups.length ? setSelected(p) : onAdd(p, [], 1, ''));

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
        <Input className="pl-9" placeholder="Buscar producto…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {[{ id: 'all', name: 'Todo', color: '#475569' }, ...menu.categories].map((c) => (
          <button
            key={c.id}
            onClick={() => setCategory(c.id)}
            className={clsx('min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold transition', category === c.id ? 'text-white shadow' : 'bg-white text-slate-700 ring-1 ring-slate-200')}
            style={category === c.id ? { background: c.color } : undefined}
          >
            {c.name}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-24 lg:pb-2">
        {products.length === 0 && <p className="p-6 text-center text-sm text-slate-500">No hay productos en esta categoría.</p>}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {products.map((p) => (
            <button
              key={p.id}
              onClick={() => pick(p)}
              className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition active:scale-[0.98] hover:border-brand hover:shadow-md"
            >
              <ProductImage src={p.imageUrl} alt={p.name} color={colors.get(p.categoryId ?? '')} className="aspect-[4/3] w-full" />
              <div className="flex flex-1 flex-col p-2.5">
                <p className="line-clamp-2 text-sm leading-tight font-semibold">
                  {p.isCombo && <span className="mr-1 rounded bg-brand/15 px-1 text-[10px] font-bold text-brand-dark uppercase">Combo</span>}
                  {p.name}
                </p>
                {p.isCombo && p.comboItems?.length ? (
                  <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">Incluye: {p.comboItems.map((c) => `${c.quantity > 1 ? `${c.quantity}× ` : ''}${c.name}`).join(', ')}</p>
                ) : (
                  p.description && <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{p.description}</p>
                )}
                <p className="mt-auto pt-1 text-sm font-bold text-brand-dark">
                  {p.modifierGroups.length > 0 && <span className="text-xs font-normal text-slate-500">desde </span>}
                  {formatCOP(p.price)}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
      {selected && <ModifierModal product={selected} onClose={() => setSelected(null)} onAdd={(o, q, n) => { onAdd(selected, o, q, n); setSelected(null); }} />}
    </div>
  );
}

function ModifierModal({ product, onClose, onAdd }: { product: MenuProduct; onClose: () => void; onAdd: (o: MenuOption[], q: number, notes: string) => void }) {
  // Cantidad elegida de cada opción por grupo. Se preselecciona la primera opción de los grupos obligatorios de una sola elección.
  const [counts, setCounts] = useState<Record<string, Record<string, number>>>(() =>
    Object.fromEntries(product.modifierGroups.map((g) => [g.id, g.minSelect === 1 && g.maxSelect === 1 ? { [g.options[0].id]: 1 } : {}])),
  );
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');

  const total = (groupId: string) => Object.values(counts[groupId] ?? {}).reduce((s, n) => s + n, 0);

  const toggle = (groupId: string, optionId: string, max: number) => {
    setCounts((prev) => {
      const current = prev[groupId] ?? {};
      if (current[optionId]) {
        const { [optionId]: _, ...rest } = current;
        return { ...prev, [groupId]: rest };
      }
      if (max === 1) return { ...prev, [groupId]: { [optionId]: 1 } };
      if (total(groupId) >= max) return prev;
      return { ...prev, [groupId]: { ...current, [optionId]: 1 } };
    });
  };

  const step = (groupId: string, optionId: string, delta: number, max: number) => {
    setCounts((prev) => {
      const current = prev[groupId] ?? {};
      const next = Math.max(0, (current[optionId] ?? 0) + delta);
      if (delta > 0 && total(groupId) >= max) return prev;
      const updated = { ...current, [optionId]: next };
      if (!next) delete updated[optionId];
      return { ...prev, [groupId]: updated };
    });
  };

  const options = product.modifierGroups.flatMap((g) => g.options.flatMap((o) => Array.from({ length: counts[g.id]?.[o.id] ?? 0 }, () => o)));
  const missing = product.modifierGroups.filter((g) => total(g.id) < g.minSelect);
  const unit = product.price + options.reduce((s, o) => s + o.priceDelta, 0);

  return (
    <Modal open onClose={onClose} title={product.name} size="md"
      footer={
        <div className="flex w-full items-center gap-3">
          <div className="flex items-center gap-1 rounded-xl border border-slate-300">
            <button className="p-3" onClick={() => setQuantity(Math.max(1, quantity - 1))} aria-label="Menos"><Minus className="size-4" /></button>
            <span className="w-8 text-center font-bold tabular-nums">{quantity}</span>
            <button className="p-3" onClick={() => setQuantity(quantity + 1)} aria-label="Más"><Plus className="size-4" /></button>
          </div>
          <Button className="flex-1" disabled={missing.length > 0} onClick={() => onAdd(options, quantity, notes)}>
            Agregar {formatCOP(unit * quantity)}
          </Button>
        </div>
      }>
      <div className="space-y-5">
        {product.isCombo && product.comboItems?.length ? (
          <div className="rounded-xl bg-brand/10 p-3 text-sm">
            <p className="font-semibold text-brand-dark">Este combo incluye</p>
            <ul className="mt-1 text-slate-700">{product.comboItems.map((c, i) => <li key={i}>• {c.quantity}× {c.name}</li>)}</ul>
          </div>
        ) : null}
        {product.description && <p className="text-sm text-slate-600">{product.description}</p>}
        {product.modifierGroups.map((g) => (
          <div key={g.id}>
            <div className="mb-2 flex items-baseline justify-between">
              <p className="font-semibold">{g.name}</p>
              <span className={clsx('text-xs', total(g.id) < g.minSelect ? 'font-semibold text-red-600' : 'text-slate-500')}>
                {g.minSelect > 0 ? 'Obligatorio' : 'Opcional'} · {g.maxSelect === 1 ? 'elige 1' : `hasta ${g.maxSelect}`}
                {g.allowRepeat && g.maxSelect > 1 ? ' · puedes repetir' : ''}
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {g.options.map((o) => {
                const n = counts[g.id]?.[o.id] ?? 0;
                if (g.allowRepeat && g.maxSelect > 1) {
                  return (
                    <div key={o.id} className={clsx('flex min-h-12 items-center justify-between gap-2 rounded-xl border px-3 text-sm', n ? 'border-brand bg-brand/10' : 'border-slate-200 bg-white')}>
                      <span className={clsx('min-w-0', n && 'font-semibold')}>
                        {o.name}
                        {o.priceDelta !== 0 && <span className="block text-xs text-slate-600">{o.priceDelta > 0 ? '+' : ''}{formatCOP(o.priceDelta)}</span>}
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        <button className="rounded-lg border border-slate-200 bg-white p-1.5 disabled:opacity-40" disabled={!n} onClick={() => step(g.id, o.id, -1, g.maxSelect)} aria-label={`Quitar ${o.name}`}><Minus className="size-4" /></button>
                        <span className="w-5 text-center font-bold tabular-nums">{n}</span>
                        <button className="rounded-lg border border-slate-200 bg-white p-1.5 disabled:opacity-40" disabled={total(g.id) >= g.maxSelect} onClick={() => step(g.id, o.id, 1, g.maxSelect)} aria-label={`Agregar ${o.name}`}><Plus className="size-4" /></button>
                      </span>
                    </div>
                  );
                }
                return (
                  <button key={o.id} onClick={() => toggle(g.id, o.id, g.maxSelect)}
                    className={clsx('flex min-h-12 items-center justify-between rounded-xl border px-3 text-left text-sm transition', n ? 'border-brand bg-brand/10 font-semibold' : 'border-slate-200 bg-white')}>
                    <span>{o.name}</span>
                    {o.priceDelta !== 0 && <span className="text-slate-600">{o.priceDelta > 0 ? '+' : ''}{formatCOP(o.priceDelta)}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <div>
          <p className="mb-2 font-semibold">Nota para cocina</p>
          <Textarea value={notes} maxLength={200} placeholder="Ej. sin cebolla" onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}
