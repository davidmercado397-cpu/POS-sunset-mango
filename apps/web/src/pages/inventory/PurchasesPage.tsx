import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { Modal } from '../../components/Modal';
import { MoneyInput } from '../../components/MoneyInput';
import { Badge, Button, Checkbox, EmptyState, Field, Input, PageHeader, Select, Table, Tabs, Textarea } from '../../components/ui';
import { api } from '../../lib/api';
import { formatCOP, formatDate, formatQty, todayISO } from '../../lib/format';
import { useApi, useApiMutation } from '../../lib/hooks';
import type { InventoryItem } from '../../lib/types';

interface Supplier { id: string; name: string; nit: string | null; phone: string | null; email: string | null; notes: string | null; isActive: boolean }
interface PurchaseRow { id: string; date: string; invoiceNumber: string | null; total: number; paidFromCash: boolean; supplier: { name: string } | null; _count: { items: number } }
interface PurchaseDetail extends Omit<PurchaseRow, '_count'> { notes: string | null; items: { id: string; quantity: number; unitCost: number; total: number; item?: { name: string; unit: string } }[] }

export function PurchasesPage() {
  const [tab, setTab] = useState<'purchases' | 'suppliers'>('purchases');
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Compras" subtitle="Entradas de inventario con su costo" />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'purchases', label: 'Compras' }, { value: 'suppliers', label: 'Proveedores' }]} />
      {tab === 'purchases' ? <PurchasesTab /> : <SuppliersTab />}
    </div>
  );
}

function PurchasesTab() {
  const { branchId } = useAuth();
  const [from, setFrom] = useState(() => new Date(Date.now() - 30 * 86400_000 - 5 * 3600_000).toISOString().slice(0, 10));
  const [to, setTo] = useState(todayISO());
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const list = useApi<PurchaseRow[]>(['purchases', branchId, from, to], `/purchases?from=${from}&to=${to}`);
  const detail = useApi<PurchaseDetail>(['purchases', 'detail', selected], selected ? `/purchases/${selected}` : null);
  const total = list.data?.reduce((s, p) => s + p.total, 0) ?? 0;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Desde"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Hasta"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <div className="flex-1 text-right text-sm text-slate-600">Total: <b>{formatCOP(total)}</b></div>
        <Button onClick={() => setCreating(true)}><Plus className="size-4" /> Nueva compra</Button>
      </div>
      {list.data?.length === 0 ? <EmptyState>Sin compras en este rango.</EmptyState> : (
        <Table>
          <thead><tr><th>Fecha</th><th>Proveedor</th><th>Factura</th><th>Ítems</th><th className="text-right">Total</th></tr></thead>
          <tbody>
            {list.data?.map((p) => (
              <tr key={p.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setSelected(p.id)}>
                <td>{formatDate(p.date)}</td>
                <td>{p.supplier?.name ?? '—'}</td>
                <td>{p.invoiceNumber ?? '—'} {p.paidFromCash && <Badge tone="amber">Pagada con caja</Badge>}</td>
                <td>{p._count.items}</td>
                <td className="text-right font-semibold tabular-nums">{formatCOP(p.total)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {creating && <PurchaseModal onClose={() => setCreating(false)} />}
      {selected && detail.data && (
        <Modal open size="lg" onClose={() => setSelected(null)} title={`Compra ${detail.data.invoiceNumber ?? ''}`}>
          <div className="space-y-3 text-sm">
            <p className="text-slate-500">{formatDate(detail.data.date)} · {detail.data.supplier?.name ?? 'Sin proveedor'}</p>
            <Table>
              <thead><tr><th>Ítem</th><th className="text-right">Cantidad</th><th className="text-right">Costo unit.</th><th className="text-right">Total</th></tr></thead>
              <tbody>
                {detail.data.items.map((i) => (
                  <tr key={i.id}><td>{i.item?.name}</td><td className="text-right">{formatQty(i.quantity)} {i.item?.unit}</td><td className="text-right">{formatCOP(i.unitCost)}</td><td className="text-right">{formatCOP(i.total)}</td></tr>
                ))}
              </tbody>
            </Table>
            <p className="text-right text-base font-bold">Total {formatCOP(detail.data.total)}</p>
            {detail.data.notes && <p className="text-slate-600">{detail.data.notes}</p>}
          </div>
        </Modal>
      )}
    </div>
  );
}

function PurchaseModal({ onClose }: { onClose: () => void }) {
  const items = useApi<InventoryItem[]>(['inventory', 'items'], '/inventory/items');
  const suppliers = useApi<Supplier[]>(['suppliers'], '/suppliers');
  const [form, setForm] = useState({ supplierId: '', invoiceNumber: '', date: todayISO(), notes: '', paidFromCash: false });
  const [lines, setLines] = useState<{ itemId: string; quantity: string; unitCost: number }[]>([{ itemId: '', quantity: '', unitCost: 0 }]);
  const valid = lines.filter((l) => l.itemId && Number(l.quantity) > 0);
  const total = valid.reduce((s, l) => s + Math.round(Number(l.quantity) * l.unitCost), 0);
  const save = useApiMutation(
    () => api('/purchases', {
      method: 'POST',
      json: {
        supplierId: form.supplierId || undefined,
        invoiceNumber: form.invoiceNumber || undefined,
        date: form.date ? new Date(`${form.date}T12:00:00-05:00`).toISOString() : undefined,
        notes: form.notes || undefined,
        paidFromCash: form.paidFromCash,
        items: valid.map((l) => ({ itemId: l.itemId, quantity: Number(l.quantity), unitCost: l.unitCost })),
      },
    }),
    { invalidate: [['purchases'], ['inventory'], ['cash']], success: 'Compra registrada' },
  );
  const update = (i: number, patch: Partial<(typeof lines)[number]>) => setLines(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  return (
    <Modal open size="xl" onClose={onClose} title="Nueva compra"
      footer={<Button loading={save.isPending} disabled={!valid.length} onClick={() => save.mutate(undefined, { onSuccess: onClose })}>Registrar compra {formatCOP(total)}</Button>}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Proveedor">
            <Select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
              <option value="">Sin proveedor</option>
              {suppliers.data?.filter((s) => s.isActive).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="N.º de factura"><Input value={form.invoiceNumber} onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })} /></Field>
          <Field label="Fecha"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
        </div>
        <div className="space-y-2">
          {lines.map((l, i) => {
            const item = items.data?.find((x) => x.id === l.itemId);
            return (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 p-2">
                <Select className="min-w-48 flex-1" value={l.itemId} onChange={(e) => update(i, { itemId: e.target.value })}>
                  <option value="">Ítem…</option>
                  {items.data?.filter((x) => x.isActive).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </Select>
                <Input className="w-28 text-right" type="number" step="any" min={0} placeholder={item?.unit ?? 'Cant.'} value={l.quantity} onChange={(e) => update(i, { quantity: e.target.value })} />
                <div className="w-36"><MoneyInput value={l.unitCost} placeholder="Costo unit." onChange={(v) => update(i, { unitCost: v })} /></div>
                <span className="w-28 text-right text-sm font-semibold tabular-nums">{formatCOP(Math.round(Number(l.quantity || 0) * l.unitCost))}</span>
                <Button variant="ghost" onClick={() => setLines(lines.filter((_, idx) => idx !== i))} aria-label="Quitar"><Trash2 className="size-4 text-red-600" /></Button>
              </div>
            );
          })}
          <Button variant="secondary" onClick={() => setLines([...lines, { itemId: '', quantity: '', unitCost: 0 }])}><Plus className="size-4" /> Agregar ítem</Button>
          <p className="text-xs text-slate-500">El costo es por unidad de medida del ítem (ej. por gramo o por unidad).</p>
        </div>
        <Field label="Notas"><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        <Checkbox label="Pagada con efectivo de la caja abierta" description="Se registra automáticamente como gasto en la caja." checked={form.paidFromCash} onChange={(e) => setForm({ ...form, paidFromCash: e.target.checked })} />
      </div>
    </Modal>
  );
}

function SuppliersTab() {
  const suppliers = useApi<Supplier[]>(['suppliers'], '/suppliers');
  const [editing, setEditing] = useState<Supplier | 'new' | null>(null);
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={() => setEditing('new')}><Plus className="size-4" /> Nuevo proveedor</Button></div>
      <Table>
        <thead><tr><th>Nombre</th><th>NIT</th><th>Teléfono</th><th>Correo</th><th /></tr></thead>
        <tbody>
          {suppliers.data?.map((s) => (
            <tr key={s.id}>
              <td className="font-medium">{s.name} {!s.isActive && <Badge>Inactivo</Badge>}</td>
              <td>{s.nit ?? '—'}</td><td>{s.phone ?? '—'}</td><td>{s.email ?? '—'}</td>
              <td className="text-right"><Button variant="ghost" onClick={() => setEditing(s)} aria-label="Editar"><Pencil className="size-4" /></Button></td>
            </tr>
          ))}
        </tbody>
      </Table>
      {editing && <SupplierModal supplier={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function SupplierModal({ supplier, onClose }: { supplier: Supplier | null; onClose: () => void }) {
  const [form, setForm] = useState({ name: supplier?.name ?? '', nit: supplier?.nit ?? '', phone: supplier?.phone ?? '', email: supplier?.email ?? '', notes: supplier?.notes ?? '', isActive: supplier?.isActive ?? true });
  const save = useApiMutation(() => api(supplier ? `/suppliers/${supplier.id}` : '/suppliers', { method: supplier ? 'PUT' : 'POST', json: form }), {
    invalidate: [['suppliers']], success: 'Proveedor guardado',
  });
  return (
    <Modal open size="md" onClose={onClose} title={supplier ? 'Editar proveedor' : 'Nuevo proveedor'}
      footer={<Button loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: onClose })}>Guardar</Button>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="NIT"><Input value={form.nit} onChange={(e) => setForm({ ...form, nit: e.target.value })} /></Field>
        <Field label="Teléfono"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
        <Field label="Correo"><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <div className="sm:col-span-2"><Field label="Notas"><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field></div>
        {supplier && <Checkbox label="Activo" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />}
      </div>
    </Modal>
  );
}
