import { AlertTriangle, ClipboardList, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { Modal } from '../../components/Modal';
import { MoneyInput } from '../../components/MoneyInput';
import { Badge, Button, Checkbox, EmptyState, Field, Input, PageHeader, Select, Table, Tabs, Textarea } from '../../components/ui';
import { api } from '../../lib/api';
import { formatCOP, formatDateTime, formatQty, todayISO } from '../../lib/format';
import { useApi, useApiMutation } from '../../lib/hooks';
import { UNITS, type InventoryItem } from '../../lib/types';

interface StockRow { id: string; name: string; type: 'INGREDIENT' | 'PRODUCT'; unit: string; isActive: boolean; minStock: number; quantity: number; avgCost: number; value: number; low: boolean }

const MOVEMENT_LABELS: Record<string, string> = {
  INITIAL: 'Entrada manual', PURCHASE: 'Compra', SALE: 'Venta', VOID: 'Anulación', ADJUSTMENT: 'Ajuste por conteo',
  WASTE: 'Merma', TRANSFER_OUT: 'Traslado enviado', TRANSFER_IN: 'Traslado recibido',
};

export function InventoryPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState<'stock' | 'items' | 'kardex'>('stock');
  const tabs = [
    { value: 'stock' as const, label: 'Existencias' },
    ...(can('inventory.manage') ? [{ value: 'items' as const, label: 'Insumos y productos' }] : []),
    { value: 'kardex' as const, label: 'Kardex' },
  ];
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Inventario" subtitle="Existencias de la sede, insumos y movimientos" />
      <Tabs value={tab} onChange={setTab} tabs={tabs} />
      {tab === 'stock' && <StockTab />}
      {tab === 'items' && <ItemsTab />}
      {tab === 'kardex' && <KardexTab />}
    </div>
  );
}

function StockTab() {
  const { branchId, can } = useAuth();
  const stock = useApi<StockRow[]>(['inventory', 'stock', branchId], '/inventory/stock');
  const [search, setSearch] = useState('');
  const [onlyLow, setOnlyLow] = useState(false);
  const [adjusting, setAdjusting] = useState<'COUNT' | 'WASTE' | 'IN' | null>(null);
  const [costing, setCosting] = useState<StockRow | null>(null);
  const noCost = (stock.data ?? []).filter((r) => r.isActive && r.quantity > 0 && r.avgCost === 0).length;
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (stock.data ?? []).filter((r) => r.isActive && (!onlyLow || r.low) && (!q || r.name.toLowerCase().includes(q)));
  }, [stock.data, search, onlyLow]);
  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const lowCount = stock.data?.filter((r) => r.low).length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" placeholder="Buscar" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {can('inventory.adjust') && (
          <>
            <Button variant="secondary" onClick={() => setAdjusting('IN')}><Plus className="size-4" /> Entrada</Button>
            <Button variant="secondary" onClick={() => setAdjusting('WASTE')}><Trash2 className="size-4" /> Merma</Button>
            <Button onClick={() => setAdjusting('COUNT')}><ClipboardList className="size-4" /> Conteo físico</Button>
          </>
        )}
      </div>
      {noCost > 0 && can('inventory.edit') && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {noCost} ítem(s) tienen existencias sin costo, por eso el valor del inventario no es real. Corrige el costo con el lápiz junto al costo promedio, o corrige la entrada en el Kardex.
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <Checkbox label={<span className="inline-flex items-center gap-1">Solo stock bajo {lowCount > 0 && <Badge tone="red">{lowCount}</Badge>}</span>} checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} />
        <span className="text-slate-600">Valor del inventario: <b>{formatCOP(totalValue)}</b></span>
      </div>
      {stock.data && rows.length === 0 ? <EmptyState>No hay ítems. Créalos en la pestaña “Insumos y productos”.</EmptyState> : (
        <Table>
          <thead><tr><th>Ítem</th><th className="text-right">Existencia</th><th className="text-right">Mínimo</th><th className="text-right">Costo prom.</th><th className="text-right">Valor</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <span className="font-medium">{r.name}</span> {r.type === 'PRODUCT' && <Badge tone="blue">Producto</Badge>}
                  {r.low && <span className="ml-1 inline-flex items-center gap-1 text-xs font-semibold text-red-700"><AlertTriangle className="size-3.5" /> Bajo</span>}
                </td>
                <td className={`text-right font-semibold tabular-nums ${r.quantity < 0 ? 'text-red-700' : ''}`}>{formatQty(r.quantity)} {r.unit}</td>
                <td className="text-right text-slate-500 tabular-nums">{formatQty(r.minStock)}</td>
                <td className="text-right whitespace-nowrap tabular-nums">
                  {r.quantity > 0 && r.avgCost === 0 ? <Badge tone="amber">Sin costo</Badge> : formatCOP(r.avgCost)}
                  {can('inventory.edit') && (
                    <button className="ml-1 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" onClick={() => setCosting(r)} aria-label={`Corregir costo de ${r.name}`}>
                      <Pencil className="size-3.5" />
                    </button>
                  )}
                </td>
                <td className="text-right tabular-nums">{formatCOP(r.value)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {costing && <CostModal row={costing} onClose={() => setCosting(null)} />}
      {adjusting && stock.data && <AdjustModal mode={adjusting} rows={stock.data.filter((r) => r.isActive)} onClose={() => setAdjusting(null)} />}
    </div>
  );
}

function CostModal({ row, onClose }: { row: StockRow; onClose: () => void }) {
  const [avgCost, setAvgCost] = useState(row.avgCost);
  const [reason, setReason] = useState('');
  const save = useApiMutation(() => api(`/inventory/stock/${row.id}/cost`, { method: 'PUT', json: { avgCost, reason: reason || undefined } }), {
    invalidate: [['inventory']], success: 'Costo actualizado',
  });
  return (
    <Modal open size="sm" onClose={onClose} title={`Costo de ${row.name}`}
      footer={<Button loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: onClose })}>Guardar</Button>}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">Existencia: <b>{formatQty(row.quantity)} {row.unit}</b>. El costo es por unidad ({row.unit}).</p>
        <Field label="Costo promedio por unidad"><MoneyInput value={avgCost} onChange={setAvgCost} autoFocus /></Field>
        <p className="text-sm text-slate-600">Valor del inventario: <b>{formatCOP(Math.round(Math.max(0, row.quantity) * avgCost))}</b></p>
        <Field label="Motivo (opcional)"><Input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} /></Field>
        <p className="text-xs text-slate-500">Si el error fue en una entrada, es mejor corregirla en el Kardex: así el historial queda correcto.</p>
      </div>
    </Modal>
  );
}

const ADJUST_TITLES = { COUNT: 'Conteo físico', WASTE: 'Registrar merma', IN: 'Entrada manual de inventario' };

function AdjustModal({ mode, rows, onClose }: { mode: 'COUNT' | 'WASTE' | 'IN'; rows: StockRow[]; onClose: () => void }) {
  const [values, setValues] = useState<Record<string, { quantity: string; unitCost: number }>>({});
  const [note, setNote] = useState('');
  const [search, setSearch] = useState('');
  const lines = Object.entries(values)
    .filter(([, v]) => v.quantity !== '' && !Number.isNaN(Number(v.quantity)))
    .map(([itemId, v]) => ({ itemId, quantity: Number(v.quantity), unitCost: mode !== 'WASTE' && v.unitCost ? v.unitCost : undefined }));
  const save = useApiMutation(() => api('/inventory/adjust', { method: 'POST', json: { mode, note: note || undefined, lines } }), {
    invalidate: [['inventory']], success: 'Inventario actualizado',
  });
  const visible = rows.filter((r) => !search || r.name.toLowerCase().includes(search.toLowerCase()));
  const set = (id: string, patch: Partial<{ quantity: string; unitCost: number }>) =>
    setValues({ ...values, [id]: { quantity: values[id]?.quantity ?? '', unitCost: values[id]?.unitCost ?? 0, ...patch } });

  return (
    <Modal open onClose={onClose} size="lg" title={ADJUST_TITLES[mode]}
      footer={<Button loading={save.isPending} disabled={!lines.length} onClick={() => save.mutate(undefined, { onSuccess: onClose })}>Guardar ({lines.length})</Button>}>
      <div className="space-y-3">
        <p className="text-sm text-slate-500">
          {mode === 'COUNT' && 'Escribe la cantidad real contada. El sistema calcula la diferencia y la registra como ajuste. Deja vacío lo que no contaste.'}
          {mode === 'WASTE' && 'Cantidad que se dañó, venció o se perdió.'}
          {mode === 'IN' && 'Para cargar el inventario inicial o entradas sin compra. El costo unitario actualiza el costo promedio.'}
        </p>
        <Input placeholder="Buscar ítem" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="max-h-[45dvh] space-y-2 overflow-y-auto">
          {visible.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 p-2">
              <div className="min-w-40 flex-1">
                <p className="text-sm font-medium">{r.name}</p>
                <p className="text-xs text-slate-500">Sistema: {formatQty(r.quantity)} {r.unit}</p>
              </div>
              <Input className="w-28 text-right" type="number" inputMode="decimal" min={0} step="any" placeholder={r.unit}
                value={values[r.id]?.quantity ?? ''} onChange={(e) => set(r.id, { quantity: e.target.value })} />
              {mode !== 'WASTE' && (
                <div className="w-36"><MoneyInput value={values[r.id]?.unitCost ?? 0} placeholder="Costo unit." onChange={(v) => set(r.id, { unitCost: v })} /></div>
              )}
            </div>
          ))}
        </div>
        <Field label="Nota"><Input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function ItemsTab() {
  const items = useApi<InventoryItem[]>(['inventory', 'items'], '/inventory/items');
  const [editing, setEditing] = useState<InventoryItem | 'new' | null>(null);
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={() => setEditing('new')}><Plus className="size-4" /> Nuevo ítem</Button></div>
      <p className="text-sm text-slate-500">Los <b>insumos</b> se usan en recetas (carne, pan, queso). Los <b>productos terminados</b> se compran y revenden (gaseosas, agua).</p>
      <Table>
        <thead><tr><th>Nombre</th><th>Tipo</th><th>Unidad</th><th className="text-right">Stock mínimo</th><th /></tr></thead>
        <tbody>
          {items.data?.map((i) => (
            <tr key={i.id}>
              <td className="font-medium">{i.name} {!i.isActive && <Badge>Inactivo</Badge>}</td>
              <td>{i.type === 'INGREDIENT' ? 'Insumo' : 'Producto terminado'}</td>
              <td>{UNITS.find((u) => u.value === i.unit)?.label ?? i.unit}</td>
              <td className="text-right tabular-nums">{formatQty(i.minStock)}</td>
              <td className="text-right"><Button variant="ghost" onClick={() => setEditing(i)} aria-label="Editar"><Pencil className="size-4" /></Button></td>
            </tr>
          ))}
        </tbody>
      </Table>
      {editing && <ItemModal item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ItemModal({ item, onClose }: { item: InventoryItem | null; onClose: () => void }) {
  const [form, setForm] = useState({ name: item?.name ?? '', type: item?.type ?? 'INGREDIENT', unit: item?.unit ?? 'und', minStock: item?.minStock ?? 0, isActive: item?.isActive ?? true });
  const save = useApiMutation(() => api(item ? `/inventory/items/${item.id}` : '/inventory/items', { method: item ? 'PUT' : 'POST', json: form }), {
    invalidate: [['inventory']], success: 'Ítem guardado',
  });
  return (
    <Modal open size="sm" onClose={onClose} title={item ? 'Editar ítem' : 'Nuevo ítem'}
      footer={<Button loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: onClose })}>Guardar</Button>}>
      <div className="space-y-4">
        <Field label="Nombre"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Tipo">
          <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as InventoryItem['type'] })}>
            <option value="INGREDIENT">Insumo (para recetas)</option>
            <option value="PRODUCT">Producto terminado (reventa)</option>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Unidad">
            <Select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
              {UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
            </Select>
          </Field>
          <Field label="Stock mínimo"><Input type="number" min={0} step="any" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: Number(e.target.value) })} /></Field>
        </div>
        {item && <Checkbox label="Activo" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />}
      </div>
    </Modal>
  );
}

interface Movement { id: string; itemId: string; type: string; quantity: number; unitCost: number; balanceAfter: number; note: string | null; createdAt: string; userName: string; item: { name: string; unit: string } }

function KardexTab() {
  const { branchId, can } = useAuth();
  const [editing, setEditing] = useState<Movement | null>(null);
  const items = useApi<InventoryItem[]>(['inventory', 'items'], '/inventory/items');
  const [itemId, setItemId] = useState('');
  const [from, setFrom] = useState(() => new Date(Date.now() - 30 * 86400_000 - 5 * 3600_000).toISOString().slice(0, 10));
  const [to, setTo] = useState(todayISO());
  const rows = useApi<Movement[]>(['inventory', 'movements', branchId, itemId, from, to], `/inventory/movements?itemId=${itemId}&from=${from}&to=${to}`);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Field label="Ítem">
          <Select value={itemId} onChange={(e) => setItemId(e.target.value)}>
            <option value="">Todos</option>
            {items.data?.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </Select>
        </Field>
        <Field label="Desde"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Hasta"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      {editing && <EditMovementModal movement={editing} onClose={() => setEditing(null)} />}
      {rows.data?.length === 0 ? <EmptyState>Sin movimientos en este rango.</EmptyState> : (
        <Table>
          <thead><tr><th>Fecha</th><th>Ítem</th><th>Movimiento</th><th className="text-right">Cantidad</th><th className="text-right">Saldo</th><th className="text-right">Costo unit.</th><th>Detalle</th><th /></tr></thead>
          <tbody>
            {rows.data?.map((m) => (
              <tr key={m.id}>
                <td className="whitespace-nowrap">{formatDateTime(m.createdAt)}</td>
                <td>{m.item.name}</td>
                <td>{MOVEMENT_LABELS[m.type] ?? m.type}</td>
                <td className={`text-right font-semibold tabular-nums ${m.quantity < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{m.quantity > 0 ? '+' : ''}{formatQty(m.quantity)} {m.item.unit}</td>
                <td className="text-right tabular-nums">{formatQty(m.balanceAfter)}</td>
                <td className="text-right tabular-nums">{formatCOP(m.unitCost)}</td>
                <td className="text-xs text-slate-500">{[m.note, m.userName].filter(Boolean).join(' · ')}</td>
                <td className="text-right">
                  {can('inventory.edit') && (m.type === 'INITIAL' || m.type === 'WASTE') && (
                    <Button variant="ghost" onClick={() => setEditing(m)}><Pencil className="size-4" /> Corregir</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

function EditMovementModal({ movement, onClose }: { movement: Movement; onClose: () => void }) {
  const isEntry = movement.type === 'INITIAL';
  const [quantity, setQuantity] = useState(String(Math.abs(movement.quantity)));
  const [unitCost, setUnitCost] = useState(movement.unitCost);
  const [reason, setReason] = useState('');
  const save = useApiMutation(
    () => api(`/inventory/movements/${movement.id}`, {
      method: 'PATCH',
      json: { quantity: Number(quantity), ...(isEntry ? { unitCost } : {}), reason },
    }),
    { invalidate: [['inventory']], success: 'Movimiento corregido' },
  );
  return (
    <Modal open size="sm" onClose={onClose} title={`Corregir ${isEntry ? 'entrada' : 'merma'} de ${movement.item.name}`}
      footer={<Button loading={save.isPending} disabled={!(Number(quantity) > 0) || reason.trim().length < 3} onClick={() => save.mutate(undefined, { onSuccess: onClose })}>Guardar corrección</Button>}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Registrado el {formatDateTime(movement.createdAt)}: {formatQty(Math.abs(movement.quantity))} {movement.item.unit}
          {isEntry && ` a ${formatCOP(movement.unitCost)} c/u`}.
        </p>
        <Field label={`Cantidad (${movement.item.unit})`}>
          <Input type="number" inputMode="decimal" min={0} step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </Field>
        {isEntry && <Field label="Costo unitario"><MoneyInput value={unitCost} onChange={setUnitCost} /></Field>}
        <Field label="Motivo de la corrección"><Textarea value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} /></Field>
        <p className="text-xs text-slate-500">Se recalculan la existencia, el costo promedio y los saldos del kardex. La corrección queda en la auditoría.</p>
      </div>
    </Modal>
  );
}
