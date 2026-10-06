import { ArrowDownLeft, ArrowUpRight, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { Modal } from '../../components/Modal';
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, Textarea } from '../../components/ui';
import { api } from '../../lib/api';
import { formatDateTime, formatQty } from '../../lib/format';
import { useApi, useApiMutation } from '../../lib/hooks';
import type { InventoryItem } from '../../lib/types';

interface Transfer {
  id: string;
  status: 'SENT' | 'RECEIVED' | 'CANCELLED';
  direction: 'IN' | 'OUT';
  fromBranch: string;
  toBranch: string;
  notes: string | null;
  createdAt: string;
  receivedAt: string | null;
  items: { id: string; quantity: number; item?: { name: string; unit: string } }[];
}

const STATUS = { SENT: { label: 'En tránsito', tone: 'amber' }, RECEIVED: { label: 'Recibido', tone: 'green' }, CANCELLED: { label: 'Cancelado', tone: 'slate' } } as const;

export function TransfersPage() {
  const { branchId } = useAuth();
  const list = useApi<Transfer[]>(['transfers', branchId], '/transfers');
  const [creating, setCreating] = useState(false);
  const opts = { invalidate: [['transfers'], ['inventory']] };
  const receive = useApiMutation((id: string) => api(`/transfers/${id}/receive`, { method: 'POST' }), { ...opts, success: 'Traslado recibido' });
  const cancel = useApiMutation((id: string) => api(`/transfers/${id}/cancel`, { method: 'POST' }), { ...opts, success: 'Traslado cancelado' });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Traslados" subtitle="Envío y recepción de inventario entre sedes"
        actions={<Button onClick={() => setCreating(true)}><Plus className="size-4" /> Nuevo traslado</Button>} />
      {list.data?.length === 0 && <EmptyState>No hay traslados.</EmptyState>}
      <div className="space-y-3">
        {list.data?.map((t) => (
          <Card key={t.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className={`rounded-xl p-2 ${t.direction === 'IN' ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-700'}`}>
                  {t.direction === 'IN' ? <ArrowDownLeft className="size-5" /> : <ArrowUpRight className="size-5" />}
                </span>
                <div>
                  <p className="font-semibold">{t.direction === 'IN' ? `Desde ${t.fromBranch}` : `Hacia ${t.toBranch}`}</p>
                  <p className="text-xs text-slate-500">{formatDateTime(t.createdAt)}{t.receivedAt && ` · Recibido ${formatDateTime(t.receivedAt)}`}</p>
                </div>
              </div>
              <Badge tone={STATUS[t.status].tone}>{STATUS[t.status].label}</Badge>
            </div>
            <ul className="mt-3 text-sm text-slate-700">
              {t.items.map((i) => <li key={i.id}>• {formatQty(i.quantity)} {i.item?.unit} de {i.item?.name}</li>)}
            </ul>
            {t.notes && <p className="mt-2 text-sm text-slate-500">{t.notes}</p>}
            {t.status === 'SENT' && (
              <div className="mt-3 flex justify-end gap-2">
                {t.direction === 'OUT' && <Button variant="secondary" loading={cancel.isPending} onClick={() => confirm('¿Cancelar el traslado? El inventario vuelve a esta sede.') && cancel.mutate(t.id)}>Cancelar</Button>}
                {t.direction === 'IN' && <Button loading={receive.isPending} onClick={() => receive.mutate(t.id)}>Confirmar recepción</Button>}
              </div>
            )}
          </Card>
        ))}
      </div>
      {creating && <TransferModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function TransferModal({ onClose }: { onClose: () => void }) {
  const branches = useApi<{ id: string; name: string }[]>(['transfers', 'branches'], '/transfers/branches');
  const items = useApi<InventoryItem[]>(['inventory', 'items'], '/inventory/items');
  const [toBranchId, setTo] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<{ itemId: string; quantity: string }[]>([{ itemId: '', quantity: '' }]);
  const valid = lines.filter((l) => l.itemId && Number(l.quantity) > 0);
  const save = useApiMutation(
    () => api('/transfers', { method: 'POST', json: { toBranchId, notes: notes || undefined, items: valid.map((l) => ({ itemId: l.itemId, quantity: Number(l.quantity) })) } }),
    { invalidate: [['transfers'], ['inventory']], success: 'Traslado enviado' },
  );
  return (
    <Modal open size="lg" onClose={onClose} title="Nuevo traslado"
      footer={<Button loading={save.isPending} disabled={!toBranchId || !valid.length} onClick={() => save.mutate(undefined, { onSuccess: onClose })}>Enviar</Button>}>
      <div className="space-y-4">
        <Field label="Sede destino">
          <Select value={toBranchId} onChange={(e) => setTo(e.target.value)}>
            <option value="">Selecciona…</option>
            {branches.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
        {branches.data?.length === 0 && <p className="text-sm text-amber-700">No hay otras sedes activas.</p>}
        {lines.map((l, i) => (
          <div key={i} className="flex items-center gap-2">
            <Select className="flex-1" value={l.itemId} onChange={(e) => setLines(lines.map((x, idx) => (idx === i ? { ...x, itemId: e.target.value } : x)))}>
              <option value="">Ítem…</option>
              {items.data?.filter((x) => x.isActive).map((x) => <option key={x.id} value={x.id}>{x.name} ({x.unit})</option>)}
            </Select>
            <Input className="w-28 text-right" type="number" step="any" min={0} placeholder="Cant." value={l.quantity} onChange={(e) => setLines(lines.map((x, idx) => (idx === i ? { ...x, quantity: e.target.value } : x)))} />
            <Button variant="ghost" onClick={() => setLines(lines.filter((_, idx) => idx !== i))} aria-label="Quitar"><Trash2 className="size-4 text-red-600" /></Button>
          </div>
        ))}
        <Button variant="secondary" onClick={() => setLines([...lines, { itemId: '', quantity: '' }])}><Plus className="size-4" /> Agregar ítem</Button>
        <Field label="Notas"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <p className="text-xs text-slate-500">El inventario sale de esta sede al enviar y entra a la sede destino cuando allí confirmen la recepción.</p>
      </div>
    </Modal>
  );
}
