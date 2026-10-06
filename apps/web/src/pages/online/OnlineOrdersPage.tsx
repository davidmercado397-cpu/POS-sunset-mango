import clsx from 'clsx';
import { Bike, Copy, ExternalLink, Phone, ShoppingBag } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { Modal } from '../../components/Modal';
import { MoneyInput } from '../../components/MoneyInput';
import { CheckoutModal, type PaymentPayload } from '../../components/pos/CheckoutModal';
import type { PaymentMethod } from '../../components/pos/types';
import { toast } from '../../components/toast';
import { Alert, Badge, Button, Card, Checkbox, EmptyState, Field, Input, PageHeader, Table, Tabs, Textarea } from '../../components/ui';
import { api } from '../../lib/api';
import { formatCOP, formatDateTime, formatTime, PAYMENT_LABELS, todayISO } from '../../lib/format';
import { useApi, useApiMutation } from '../../lib/hooks';
import { beep, useBranchSocket } from '../../lib/useBranchSocket';

type Status = 'NEW' | 'ACCEPTED' | 'READY' | 'DISPATCHED' | 'COMPLETED' | 'REJECTED' | 'CANCELLED';
interface OnlineOrder {
  id: string;
  code: string;
  status: Status;
  type: 'DELIVERY' | 'PICKUP';
  customerName: string;
  phone: string;
  address: string | null;
  addressNotes: string | null;
  notes: string | null;
  paymentMethod: PaymentMethod;
  payWith: number | null;
  items: { productName: string; quantity: number; lineTotal: number; notes: string | null; modifiers: { optionName: string }[] }[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  rejectReason: string | null;
  createdAt: string;
}
interface Settings { slug: string; branchId: string; onlineAccepting: boolean; allowDelivery: boolean; allowPickup: boolean; deliveryFee: number; minOrder: number; onlineMessage: string | null; whatsapp: string | null }

const STATUS: Record<Status, { label: string; tone: 'amber' | 'blue' | 'green' | 'brand' | 'slate' | 'red' }> = {
  NEW: { label: 'Nuevo', tone: 'amber' }, ACCEPTED: { label: 'En preparación', tone: 'blue' }, READY: { label: 'Listo', tone: 'green' },
  DISPATCHED: { label: 'En camino', tone: 'brand' }, COMPLETED: { label: 'Entregado', tone: 'slate' }, REJECTED: { label: 'Rechazado', tone: 'red' }, CANCELLED: { label: 'Cancelado', tone: 'red' },
};

export function OnlineOrdersPage() {
  const [tab, setTab] = useState<'active' | 'history' | 'settings'>('active');
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Pedidos en línea" subtitle="Domicilios y pedidos para recoger desde el enlace público" />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'active', label: 'En curso' }, { value: 'history', label: 'Historial' }, { value: 'settings', label: 'Configuración y enlace' }]} />
      {tab === 'active' && <ActiveOrders />}
      {tab === 'history' && <History />}
      {tab === 'settings' && <SettingsTab />}
    </div>
  );
}

function ActiveOrders() {
  const { branchId, can } = useAuth();
  const orders = useApi<OnlineOrder[]>(['online', branchId], '/online/orders', { refetchInterval: 30_000 });
  const settings = useApi<Settings>(['online', 'settings', branchId], '/online/settings');
  const cash = useApi<{ session: unknown }>(['cash', 'current', branchId], '/cash/current');
  useBranchSocket(branchId, [['online', branchId]]);
  const known = useRef<Set<string> | null>(null);
  const [paying, setPaying] = useState<OnlineOrder | null>(null);
  const [closing, setClosing] = useState<{ order: OnlineOrder; kind: 'reject' | 'cancel' } | null>(null);

  useEffect(() => {
    if (!orders.data) return;
    if (known.current && orders.data.some((o) => o.status === 'NEW' && !known.current!.has(o.id))) {
      beep();
      toast.success('¡Nuevo pedido en línea!');
    }
    known.current = new Set(orders.data.map((o) => o.id));
  }, [orders.data]);

  const opts = { invalidate: [['online'], ['kitchen']] };
  const move = useApiMutation((v: { id: string; status: string }) => api(`/online/orders/${v.id}/status`, { method: 'PATCH', json: { status: v.status } }), opts);
  const pay = useApiMutation((v: { id: string; p: PaymentPayload }) => api(`/online/orders/${v.id}/pay`, { method: 'POST', json: v.p }), { invalidate: [['online'], ['cash'], ['sales']], success: 'Pedido cobrado' });

  return (
    <div className="space-y-4">
      {settings.data && !settings.data.onlineAccepting && <Alert>La tienda en línea está pausada. Actívala en “Configuración y enlace”.</Alert>}
      {cash.data && !cash.data.session && <Alert>La caja está cerrada: los clientes ven la tienda como cerrada y no pueden pedir.</Alert>}
      {orders.data?.length === 0 && <EmptyState>No hay pedidos en curso. Los nuevos aparecen aquí con un sonido.</EmptyState>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {orders.data?.map((o) => (
          <Card key={o.id} className={clsx('space-y-3', o.status === 'NEW' && 'border-amber-400 ring-2 ring-amber-200')}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="flex items-center gap-2 text-lg font-bold">
                  {o.type === 'DELIVERY' ? <Bike className="size-5 text-brand" /> : <ShoppingBag className="size-5 text-brand" />} {o.code}
                </p>
                <p className="text-xs text-slate-500">{formatTime(o.createdAt)} · {o.type === 'DELIVERY' ? 'Domicilio' : 'Para recoger'}</p>
              </div>
              <Badge tone={STATUS[o.status].tone}>{STATUS[o.status].label}</Badge>
            </div>
            <div className="text-sm">
              <p className="font-semibold">{o.customerName}</p>
              <a href={`tel:${o.phone}`} className="inline-flex items-center gap-1 text-brand-dark underline"><Phone className="size-3.5" /> {o.phone}</a>
              {o.address && <p className="mt-1">{o.address}{o.addressNotes && <span className="text-slate-500"> · {o.addressNotes}</span>}</p>}
              {o.notes && <p className="mt-1 text-amber-700">“{o.notes}”</p>}
            </div>
            <ul className="space-y-0.5 text-sm">
              {o.items.map((i, idx) => (
                <li key={idx} className="flex justify-between gap-2">
                  <span>{i.quantity} × {i.productName}{i.modifiers.length > 0 && <span className="text-slate-500"> ({i.modifiers.map((m) => m.optionName).join(', ')})</span>}</span>
                  <span className="tabular-nums">{formatCOP(i.lineTotal)}</span>
                </li>
              ))}
              {o.deliveryFee > 0 && <li className="flex justify-between"><span>Domicilio</span><span className="tabular-nums">{formatCOP(o.deliveryFee)}</span></li>}
            </ul>
            <div className="flex items-baseline justify-between border-t pt-2">
              <span className="text-sm text-slate-600">
                {PAYMENT_LABELS[o.paymentMethod]}
                {o.payWith ? ` · paga con ${formatCOP(o.payWith)} (cambio ${formatCOP(o.payWith - o.total)})` : ''}
              </span>
              <span className="text-xl font-bold tabular-nums">{formatCOP(o.total)}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {o.status === 'NEW' && (
                <>
                  <Button className="flex-1" onClick={() => move.mutate({ id: o.id, status: 'ACCEPTED' })}>Aceptar</Button>
                  <Button variant="secondary" onClick={() => setClosing({ order: o, kind: 'reject' })}>Rechazar</Button>
                </>
              )}
              {o.status === 'ACCEPTED' && <Button className="flex-1" onClick={() => move.mutate({ id: o.id, status: 'READY' })}>Marcar listo</Button>}
              {o.type === 'DELIVERY' && (o.status === 'ACCEPTED' || o.status === 'READY') && (
                <Button variant="secondary" className="flex-1" onClick={() => move.mutate({ id: o.id, status: 'DISPATCHED' })}>Despachar</Button>
              )}
              {o.status !== 'NEW' && can('pos.sell') && (
                <Button className="flex-1" disabled={!cash.data?.session} onClick={() => setPaying(o)}>Entregado y cobrado</Button>
              )}
              {o.status !== 'NEW' && <Button variant="ghost" className="text-red-600" onClick={() => setClosing({ order: o, kind: 'cancel' })}>Cancelar</Button>}
            </div>
          </Card>
        ))}
      </div>
      {paying && (
        <CheckoutModal subtotal={paying.total} tipsEnabled={false} loading={pay.isPending} defaultMethod={paying.paymentMethod} defaultReceived={paying.payWith ?? 0}
          onClose={() => setPaying(null)} onConfirm={(p) => pay.mutate({ id: paying.id, p }, { onSuccess: () => setPaying(null) })} />
      )}
      {closing && <CloseModal order={closing.order} kind={closing.kind} onClose={() => setClosing(null)} />}
    </div>
  );
}

function CloseModal({ order, kind, onClose }: { order: OnlineOrder; kind: 'reject' | 'cancel'; onClose: () => void }) {
  const [reason, setReason] = useState(kind === 'reject' ? 'No tenemos disponibilidad en este momento' : '');
  const close = useApiMutation(() => api(`/online/orders/${order.id}/${kind}`, { method: 'POST', json: { reason } }), { invalidate: [['online'], ['kitchen']], success: kind === 'reject' ? 'Pedido rechazado' : 'Pedido cancelado' });
  return (
    <Modal open size="sm" onClose={onClose} title={`${kind === 'reject' ? 'Rechazar' : 'Cancelar'} pedido ${order.code}`}
      footer={<Button variant="danger" loading={close.isPending} disabled={reason.trim().length < 3} onClick={() => close.mutate(undefined, { onSuccess: onClose })}>Confirmar</Button>}>
      <Field label="Motivo (el cliente lo verá en su seguimiento)"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </Modal>
  );
}

function History() {
  const { branchId } = useAuth();
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());
  const orders = useApi<OnlineOrder[]>(['online', branchId, 'history', from, to], `/online/orders?scope=history&from=${from}&to=${to}`);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Field label="Desde"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Hasta"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <Table>
        <thead><tr><th>Código</th><th>Fecha</th><th>Cliente</th><th>Tipo</th><th>Estado</th><th className="text-right">Total</th></tr></thead>
        <tbody>
          {orders.data?.map((o) => (
            <tr key={o.id}>
              <td className="font-semibold">{o.code}</td>
              <td className="whitespace-nowrap">{formatDateTime(o.createdAt)}</td>
              <td>{o.customerName}<p className="text-xs text-slate-500">{o.phone}</p></td>
              <td>{o.type === 'DELIVERY' ? 'Domicilio' : 'Recoger'}</td>
              <td><Badge tone={STATUS[o.status].tone}>{STATUS[o.status].label}</Badge>{o.rejectReason && <p className="text-xs text-slate-500">{o.rejectReason}</p>}</td>
              <td className="text-right tabular-nums">{formatCOP(o.total)}</td>
            </tr>
          ))}
        </tbody>
      </Table>
      {orders.data?.length === 0 && <EmptyState>Sin pedidos en este rango.</EmptyState>}
    </div>
  );
}

function SettingsTab() {
  const { branchId } = useAuth();
  const { data } = useApi<Settings>(['online', 'settings', branchId], '/online/settings');
  const [form, setForm] = useState<Settings | null>(null);
  const [qr, setQr] = useState('');
  useEffect(() => { if (data) setForm(data); }, [data]);
  const url = data ? `${window.location.origin}/pedir/${data.slug}` : '';
  useEffect(() => { if (url) QRCode.toDataURL(url, { width: 360, margin: 1 }).then(setQr).catch(() => setQr('')); }, [url]);
  const save = useApiMutation(
    () => api('/online/settings', { method: 'PUT', json: { onlineAccepting: form!.onlineAccepting, allowDelivery: form!.allowDelivery, allowPickup: form!.allowPickup, deliveryFee: form!.deliveryFee, minOrder: form!.minOrder, onlineMessage: form!.onlineMessage ?? undefined, whatsapp: form!.whatsapp ?? undefined } }),
    { invalidate: [['online']], success: 'Configuración guardada' },
  );
  if (!form) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-4">
        <p className="font-semibold">Enlace público de la tienda</p>
        <p className="text-sm text-slate-500">Compártelo en WhatsApp, Instagram o imprime el QR. No requiere usuario ni contraseña.</p>
        <div className="flex gap-2">
          <Input readOnly value={url} onFocus={(e) => e.target.select()} />
          <Button variant="secondary" onClick={() => navigator.clipboard?.writeText(url).then(() => toast.success('Enlace copiado'))} aria-label="Copiar"><Copy className="size-4" /></Button>
          <a href={url} target="_blank" rel="noreferrer"><Button variant="secondary" aria-label="Abrir"><ExternalLink className="size-4" /></Button></a>
        </div>
        {qr && (
          <div className="flex flex-col items-center gap-2">
            <img src={qr} alt="Código QR de la tienda" className="size-56 rounded-xl border" />
            <a href={qr} download="qr-pedidos.png" className="text-sm font-semibold text-brand-dark underline">Descargar QR</a>
          </div>
        )}
      </Card>
      <Card className="space-y-4">
        <p className="font-semibold">Configuración de esta sede</p>
        <Checkbox label="Recibiendo pedidos" description="Si lo desactivas, la tienda se muestra cerrada. También se cierra cuando la caja está cerrada." checked={form.onlineAccepting} onChange={(e) => setForm({ ...form, onlineAccepting: e.target.checked })} />
        <Checkbox label="Domicilios" checked={form.allowDelivery} onChange={(e) => setForm({ ...form, allowDelivery: e.target.checked })} />
        <Checkbox label="Recoger en tienda" checked={form.allowPickup} onChange={(e) => setForm({ ...form, allowPickup: e.target.checked })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Valor del domicilio"><MoneyInput value={form.deliveryFee} onChange={(v) => setForm({ ...form, deliveryFee: v })} placeholder="Gratis" /></Field>
          <Field label="Pedido mínimo"><MoneyInput value={form.minOrder} onChange={(v) => setForm({ ...form, minOrder: v })} placeholder="Sin mínimo" /></Field>
        </div>
        <Field label="WhatsApp de contacto"><Input value={form.whatsapp ?? ''} inputMode="tel" placeholder="3001234567" onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} /></Field>
        <Field label="Mensaje para los clientes"><Textarea value={form.onlineMessage ?? ''} maxLength={300} placeholder="Ej. Domicilios de 11 a. m. a 9 p. m. en el norte de la ciudad" onChange={(e) => setForm({ ...form, onlineMessage: e.target.value })} /></Field>
        <div className="flex justify-end"><Button loading={save.isPending} onClick={() => save.mutate()}>Guardar</Button></div>
      </Card>
    </div>
  );
}
