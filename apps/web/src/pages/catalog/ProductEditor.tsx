import { ChevronDown, ChevronUp, ImagePlus, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../auth/AuthContext';
import { Modal } from '../../components/Modal';
import { MoneyInput } from '../../components/MoneyInput';
import { ProductImage } from '../../components/ProductImage';
import { toast } from '../../components/toast';
import { Button, Checkbox, Field, Input, Select, Textarea } from '../../components/ui';
import { api, upload } from '../../lib/api';
import { formatCOP } from '../../lib/format';
import { useApi } from '../../lib/hooks';
import type { Category, InventoryItem, ModifierGroup, Product, RecipeLine } from '../../lib/types';
import { RecipeEditor } from './RecipeEditor';

export function ProductEditor({ product, categories, onClose }: { product: Product | null; categories: Category[]; onClose: () => void }) {
  const { session } = useAuth();
  const qc = useQueryClient();
  const inventoryEnabled = !!session?.tenant?.enabledModules.includes('inventory');
  const kitchenEnabled = !!session?.tenant?.enabledModules.includes('kitchen');
  const items = useApi<InventoryItem[]>(['inventory', 'items'], inventoryEnabled ? '/inventory/items' : null);
  const branches = session?.branches ?? [];

  const [form, setForm] = useState({
    name: product?.name ?? '',
    description: product?.description ?? '',
    price: product?.price ?? 0,
    categoryId: product?.categoryId ?? categories[0]?.id ?? '',
    isActive: product?.isActive ?? true,
    sendToKitchen: product?.sendToKitchen ?? true,
    disabledBranchIds: product?.disabledBranchIds ?? [],
  });
  const [groups, setGroups] = useState<ModifierGroup[]>(product?.modifierGroups ?? []);
  const [recipe, setRecipe] = useState<RecipeLine[]>(product?.recipe ?? []);
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(product?.imageUrl ?? null);
  const [saving, setSaving] = useState(false);

  const cleanRecipe = (lines: RecipeLine[]) => lines.filter((l) => l.inventoryItemId && l.quantity > 0).map(({ inventoryItemId, quantity }) => ({ inventoryItemId, quantity }));

  async function save() {
    if (!form.name.trim()) return toast.error('Escribe el nombre del producto');
    setSaving(true);
    try {
      const body = {
        ...form,
        description: form.description || undefined,
        categoryId: form.categoryId || null,
        modifierGroups: groups.map((g) => ({
          id: g.id, name: g.name, minSelect: g.minSelect, maxSelect: g.maxSelect,
          options: g.options.map((o) => ({ id: o.id, name: o.name, priceDelta: o.priceDelta, isActive: o.isActive, recipe: inventoryEnabled ? cleanRecipe(o.recipe) : undefined })),
        })),
        recipe: inventoryEnabled ? cleanRecipe(recipe) : undefined,
      };
      const saved = await api<Product>(product ? `/catalog/products/${product.id}` : '/catalog/products', { method: product ? 'PUT' : 'POST', json: body });
      if (image) await upload(`/catalog/products/${saved.id}/image`, image);
      await qc.invalidateQueries({ queryKey: ['catalog'] });
      toast.success('Producto guardado');
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function removeImage() {
    if (product?.imageUrl && preview === product.imageUrl) {
      await api(`/catalog/products/${product.id}/image`, { method: 'DELETE' }).catch(toast.error);
      await qc.invalidateQueries({ queryKey: ['catalog'] });
    }
    setImage(null);
    setPreview(null);
  }

  const updateGroup = (i: number, patch: Partial<ModifierGroup>) => setGroups(groups.map((g, idx) => (idx === i ? { ...g, ...patch } : g)));
  const moveGroup = (i: number, dir: -1 | 1) => {
    const next = [...groups];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    setGroups(next);
  };

  return (
    <Modal open onClose={onClose} size="xl" title={product ? 'Editar producto' : 'Nuevo producto'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={saving} onClick={save}>Guardar</Button></>}>
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <div className="space-y-2">
          <ProductImage src={preview} alt={form.name} className="aspect-square w-full rounded-2xl border border-slate-200" />
          <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-300 text-sm font-semibold hover:bg-slate-50">
            <ImagePlus className="size-4" /> {preview ? 'Cambiar foto' : 'Subir foto'}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                if (f.size > 8e6) toast.error('La imagen supera 8 MB');
                else { setImage(f); setPreview(URL.createObjectURL(f)); }
              }
              e.target.value = '';
            }} />
          </label>
          {preview && <Button variant="ghost" className="w-full" onClick={removeImage}><Trash2 className="size-4" /> Quitar foto</Button>}
        </div>

        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Precio"><MoneyInput value={form.price} onChange={(price) => setForm({ ...form, price })} /></Field>
            <Field label="Categoría">
              <Select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                <option value="">Sin categoría</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <div className="flex flex-col justify-end">
              <Checkbox label="Disponible para la venta" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
              {kitchenEnabled && (
                <Checkbox label="Enviar a cocina" checked={form.sendToKitchen} onChange={(e) => setForm({ ...form, sendToKitchen: e.target.checked })} />
              )}
            </div>
          </div>
          <Field label="Descripción (se muestra en el POS)">
            <Textarea value={form.description} maxLength={300} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>

          {branches.length > 1 && (
            <div>
              <p className="mb-1 text-sm font-semibold">Disponible en las sedes</p>
              <div className="grid gap-1 sm:grid-cols-2">
                {branches.map((b) => (
                  <Checkbox key={b.id} label={b.name} checked={!form.disabledBranchIds.includes(b.id)}
                    onChange={(e) => setForm({ ...form, disabledBranchIds: e.target.checked ? form.disabledBranchIds.filter((x) => x !== b.id) : [...form.disabledBranchIds, b.id] })} />
                ))}
              </div>
            </div>
          )}

          {inventoryEnabled && (
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-semibold">Receta</p>
              <p className="mb-3 text-xs text-slate-500">Lo que se descuenta del inventario por cada unidad vendida. Puede mezclar insumos y productos terminados.</p>
              <RecipeEditor items={items.data ?? []} value={recipe} onChange={setRecipe} />
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Variantes y adiciones</p>
                <p className="text-xs text-slate-500">Ej. "Tamaño" (elige 1, obligatorio) o "Adiciones" (opcional, varias).</p>
              </div>
              <Button variant="secondary" onClick={() => setGroups([...groups, { name: '', minSelect: 0, maxSelect: 1, options: [{ name: '', priceDelta: 0, isActive: true, recipe: [] }] }])}>
                <Plus className="size-4" /> Grupo
              </Button>
            </div>
            {groups.map((g, gi) => (
              <div key={g.id ?? `new-${gi}`} className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                <div className="flex flex-wrap items-end gap-2">
                  <Field label="Nombre del grupo"><Input value={g.name} placeholder="Tamaño" onChange={(e) => updateGroup(gi, { name: e.target.value })} /></Field>
                  <Field label="Mínimo"><Input className="w-20" type="number" min={0} value={g.minSelect} onChange={(e) => updateGroup(gi, { minSelect: Math.max(0, Number(e.target.value)) })} /></Field>
                  <Field label="Máximo"><Input className="w-20" type="number" min={1} value={g.maxSelect} onChange={(e) => updateGroup(gi, { maxSelect: Math.max(1, Number(e.target.value)) })} /></Field>
                  <div className="ml-auto flex">
                    <Button variant="ghost" disabled={gi === 0} onClick={() => moveGroup(gi, -1)} aria-label="Subir"><ChevronUp className="size-4" /></Button>
                    <Button variant="ghost" disabled={gi === groups.length - 1} onClick={() => moveGroup(gi, 1)} aria-label="Bajar"><ChevronDown className="size-4" /></Button>
                    <Button variant="ghost" onClick={() => setGroups(groups.filter((_, i) => i !== gi))} aria-label="Eliminar grupo"><Trash2 className="size-4 text-red-600" /></Button>
                  </div>
                </div>
                <p className="text-xs text-slate-500">{g.minSelect > 0 ? `Obligatorio: elegir ${g.minSelect === g.maxSelect ? g.minSelect : `de ${g.minSelect} a ${g.maxSelect}`}` : `Opcional: hasta ${g.maxSelect}`}</p>
                {g.options.map((o, oi) => (
                  <OptionRow key={o.id ?? `o-${oi}`} option={o} items={items.data ?? []} inventoryEnabled={inventoryEnabled}
                    onChange={(patch) => updateGroup(gi, { options: g.options.map((x, i) => (i === oi ? { ...x, ...patch } : x)) })}
                    onRemove={() => updateGroup(gi, { options: g.options.filter((_, i) => i !== oi) })} />
                ))}
                <Button variant="ghost" onClick={() => updateGroup(gi, { options: [...g.options, { name: '', priceDelta: 0, isActive: true, recipe: [] }] })}>
                  <Plus className="size-4" /> Opción
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function OptionRow({ option, items, inventoryEnabled, onChange, onRemove }: {
  option: ModifierGroup['options'][number]; items: InventoryItem[]; inventoryEnabled: boolean;
  onChange: (p: Partial<ModifierGroup['options'][number]>) => void; onRemove: () => void;
}) {
  const [showRecipe, setShowRecipe] = useState(false);
  return (
    <div className="rounded-xl bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Input className="min-w-40 flex-1" value={option.name} placeholder="Ej. Grande" onChange={(e) => onChange({ name: e.target.value })} />
        <div className="w-36"><MoneyInput value={option.priceDelta} onChange={(priceDelta) => onChange({ priceDelta })} placeholder="+ precio" /></div>
        {inventoryEnabled && (
          <Button variant="ghost" onClick={() => setShowRecipe(!showRecipe)}>Receta ({option.recipe.length})</Button>
        )}
        <Button variant="ghost" onClick={onRemove} aria-label="Quitar opción"><Trash2 className="size-4 text-red-600" /></Button>
      </div>
      {option.priceDelta > 0 && <p className="mt-1 text-xs text-slate-500">Suma {formatCOP(option.priceDelta)} al precio</p>}
      {showRecipe && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <p className="mb-2 text-xs text-slate-500">Insumos adicionales que descuenta esta opción.</p>
          <RecipeEditor compact items={items} value={option.recipe} onChange={(recipe) => onChange({ recipe })} />
        </div>
      )}
    </div>
  );
}
