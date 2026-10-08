import { Plus, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Modal } from '../../components/Modal';
import { ProductImage } from '../../components/ProductImage';
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Tabs } from '../../components/ui';
import { api } from '../../lib/api';
import { formatCOP } from '../../lib/format';
import { useApi, useApiMutation } from '../../lib/hooks';
import type { Category, Product } from '../../lib/types';
import { ProductEditor } from './ProductEditor';

export function CatalogPage() {
  const [tab, setTab] = useState<'products' | 'categories'>('products');
  const categories = useApi<Category[]>(['catalog', 'categories'], '/catalog/categories');
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Catálogo" subtitle="Productos compartidos por todas las sedes del negocio" />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'products', label: 'Productos' }, { value: 'categories', label: 'Categorías' }]} />
      {tab === 'products' ? <ProductsTab categories={categories.data ?? []} /> : <CategoriesTab categories={categories.data ?? []} />}
    </div>
  );
}

function ProductsTab({ categories }: { categories: Category[] }) {
  const products = useApi<Product[]>(['catalog', 'products'], '/catalog/products');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [editing, setEditing] = useState<Product | 'new' | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (products.data ?? []).filter(
      (p) =>
        (category === 'all' || p.categoryId === category || (category === 'none' && !p.categoryId) || (category === 'inactive' && !p.isActive)) &&
        (!q || p.name.toLowerCase().includes(q)),
    );
  }, [products.data, search, category]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" placeholder="Buscar producto" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button onClick={() => setEditing('new')}><Plus className="size-4" /> Nuevo producto</Button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[{ id: 'all', name: 'Todos', color: '#64748b' }, ...categories, { id: 'none', name: 'Sin categoría', color: '#94a3b8' }, { id: 'inactive', name: 'Inactivos', color: '#94a3b8' }].map((c) => (
          <button key={c.id} onClick={() => setCategory(c.id)}
            className={`min-h-10 shrink-0 rounded-full border px-4 text-sm font-semibold ${category === c.id ? 'border-transparent bg-brand text-brand-contrast' : 'border-slate-300 bg-white'}`}>
            {c.name}
          </button>
        ))}
      </div>
      {products.data && filtered.length === 0 && <EmptyState>No hay productos. Crea el primero con su foto.</EmptyState>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {filtered.map((p) => (
          <button key={p.id} onClick={() => setEditing(p)} className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition hover:border-brand hover:shadow-md">
            <ProductImage src={p.imageUrl} alt={p.name} color={p.category?.color} className="aspect-[4/3] w-full" />
            <div className="space-y-1 p-3">
              <p className="line-clamp-2 leading-tight font-semibold">{p.name}</p>
              <p className="text-sm font-bold text-brand-dark">{formatCOP(p.price)}</p>
              <div className="flex flex-wrap gap-1">
                {!p.isActive && <Badge tone="red">Inactivo</Badge>}
                {p.modifierGroups.length > 0 && <Badge tone="blue">{p.modifierGroups.length} grupos</Badge>}
                {p.isCombo && <Badge tone="brand">Combo</Badge>}
                {p.recipe.length > 0 && <Badge tone="green">Receta</Badge>}
              </div>
            </div>
          </button>
        ))}
      </div>
      {editing && <ProductEditor product={editing === 'new' ? null : editing} categories={categories} products={products.data ?? []} onClose={() => setEditing(null)} />}
    </div>
  );
}

function CategoriesTab({ categories }: { categories: Category[] }) {
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const del = useApiMutation((id: string) => api(`/catalog/categories/${id}`, { method: 'DELETE' }), { invalidate: [['catalog']], success: 'Categoría eliminada' });
  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex justify-end"><Button onClick={() => setEditing('new')}><Plus className="size-4" /> Nueva categoría</Button></div>
      <Card className="divide-y divide-slate-100 p-0">
        {categories.length > 0 && <p className="px-5 py-2 text-xs text-slate-500">Ordenadas por prioridad: la de número más bajo sale primero en el POS y en la tienda.</p>}
        {categories.length === 0 && <p className="p-5 text-sm text-slate-500">Sin categorías.</p>}
        {categories.map((c) => (
          <div key={c.id} className="flex items-center gap-3 px-5 py-3">
            <span className="w-8 shrink-0 text-center text-sm font-semibold tabular-nums text-slate-500" title="Prioridad">{c.sortOrder}</span>
            <span className="size-4 shrink-0 rounded-full" style={{ background: c.color }} />
            <button className="flex-1 text-left font-medium" onClick={() => setEditing(c)}>{c.name}</button>
            {!c.isActive && <Badge>Oculta</Badge>}
            <span className="text-xs text-slate-500">{c._count?.products ?? 0} productos</span>
            <Button variant="ghost" aria-label="Eliminar" onClick={() => confirm(`¿Eliminar ${c.name}? Los productos quedarán sin categoría.`) && del.mutate(c.id)}>
              <Trash2 className="size-4 text-red-600" />
            </Button>
          </div>
        ))}
      </Card>
      {editing && <CategoryModal category={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

const PALETTE = ['#f97316', '#ef4444', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#78716c'];

function CategoryModal({ category, onClose }: { category: Category | null; onClose: () => void }) {
  const [form, setForm] = useState({ name: category?.name ?? '', color: category?.color ?? PALETTE[0], sortOrder: category?.sortOrder ?? 0, isActive: category?.isActive ?? true });
  const save = useApiMutation(() => api(category ? `/catalog/categories/${category.id}` : '/catalog/categories', { method: category ? 'PUT' : 'POST', json: form }), {
    invalidate: [['catalog']], success: 'Categoría guardada',
  });
  return (
    <Modal open size="sm" onClose={onClose} title={category ? 'Editar categoría' : 'Nueva categoría'}
      footer={<Button loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: onClose })}>Guardar</Button>}>
      <div className="space-y-4">
        <Field label="Nombre"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Prioridad">
          <Input type="number" min={0} value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} />
        </Field>
        <p className="-mt-2 text-xs text-slate-500">El número más bajo sale primero en el POS y en la tienda en línea (1 = primero). Si dos tienen la misma prioridad se ordenan por nombre.</p>
        <div>
          <p className="mb-2 text-sm font-medium">Color</p>
          <div className="flex flex-wrap gap-2">
            {PALETTE.map((c) => (
              <button key={c} type="button" onClick={() => setForm({ ...form, color: c })} aria-label={c}
                className={`size-9 rounded-full ${form.color === c ? 'ring-2 ring-slate-900 ring-offset-2' : ''}`} style={{ background: c }} />
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-5 accent-[var(--brand)]" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Visible en el POS</label>
      </div>
    </Modal>
  );
}
