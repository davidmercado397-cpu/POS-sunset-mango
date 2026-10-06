import { Plus, Trash2 } from 'lucide-react';
import { Button, Input, Select } from '../../components/ui';
import type { InventoryItem, RecipeLine } from '../../lib/types';

/** Lista editable de componentes de receta (insumos o productos terminados). */
export function RecipeEditor({ items, value, onChange, compact }: { items: InventoryItem[]; value: RecipeLine[]; onChange: (v: RecipeLine[]) => void; compact?: boolean }) {
  const update = (i: number, patch: Partial<RecipeLine>) => onChange(value.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const active = items.filter((i) => i.isActive);
  return (
    <div className="space-y-2">
      {value.map((line, i) => {
        const item = items.find((x) => x.id === line.inventoryItemId);
        return (
          <div key={i} className="flex items-center gap-2">
            <Select className="flex-1" value={line.inventoryItemId} onChange={(e) => update(i, { inventoryItemId: e.target.value })}>
              <option value="">Selecciona…</option>
              {active.map((it) => (
                <option key={it.id} value={it.id}>{it.name} {it.type === 'PRODUCT' ? '(producto)' : ''}</option>
              ))}
            </Select>
            <Input
              className="w-24 text-right"
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={line.quantity || ''}
              onChange={(e) => update(i, { quantity: Number(e.target.value) })}
            />
            <span className="w-10 text-xs text-slate-500">{item?.unit ?? ''}</span>
            <Button variant="ghost" type="button" onClick={() => onChange(value.filter((_, idx) => idx !== i))} aria-label="Quitar">
              <Trash2 className="size-4 text-red-600" />
            </Button>
          </div>
        );
      })}
      <Button variant={compact ? 'ghost' : 'secondary'} type="button" onClick={() => onChange([...value, { inventoryItemId: '', quantity: 1 }])}>
        <Plus className="size-4" /> Agregar componente
      </Button>
      {active.length === 0 && <p className="text-xs text-amber-700">Primero crea insumos en Inventario.</p>}
    </div>
  );
}
