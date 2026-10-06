import clsx from 'clsx';
import { ArrowLeft, Plus, Trash2, UserRound, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Modal } from '../../components/Modal';
import { CartView } from '../../components/pos/CartView';
import { CheckoutModal, type PaymentPayload } from '../../components/pos/CheckoutModal';
import { ProductPicker } from '../../components/pos/ProductPicker';
import { toApiItems, type Menu, type SaleDetail } from '../../components/pos/types';
import { useCart } from '../../components/pos/useCart';
import { toast } from '../../components/toast';
import { Alert, Button, Card, Field, Input, PageHeader, Textarea } from '../../components/ui';
import { api } from '../../lib/api';
import { formatCOP } from '../../lib/format';
import { useApi, useApiMutation } from '../../lib/hooks';
import { useBranchSocket } from '../../lib/useBranchSocket';
import { summarizeNames } from '../../lib/types';

type Target = { kind: 'new'; tableId?: string; tableName?: string } | { kind: 'order'; id: string };

function elapsed(from: string) {
  const m = Math.floor((Date.now() - new Date(from).getTime()) / 60000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

export function TablesPage() {
  const { branchId, can } = useAuth();
  const menu = useApi<Menu>(['pos', 'menu', branchId], '/pos/menu');
  const orders = useApi<SaleDetail[]>(['orders', branchId], '/orders', { refetchInterval: 30_000 });
  useBranchSocket(branchId, [['orders', branchId]]);
  const [target, setTarget] = useState<Target | null>(null);
  const [newCustomer, setNewCustomer] = useState(false);

  if (!menu.data || !orders.data) return <p className="text-slate-500">Cargando…</p>;
  if (target) return <OrderScreen menu={menu.data} target={target} onBack={() => setTarget(null)} onOpened={(id) => setTarget({ kind: 'order', id })} />;

  const byTable = new Map(orders.data.filter((o) => o.table).map((o) => [o.table!.id, o]));
  const loose = orders.data.filter((o) => !o.table);
  const areas = [...new Set(menu.data.tables.map((t) => t.area ?? ''))];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title="Mesas" subtitle={`${orders.data.length} cuentas abiertas`}
        actions={<Button variant="secondary" onClick={() => setNewCustomer(true)}><UserRound className="size-4" /> Cuenta sin mesa</Button>} />
      {!menu.data.cashSession && (
        <Alert>
          No hay caja abierta. Abre la caja para tomar pedidos. {can('cash.open') && <Link to="/caja" className="font-semibold underline">Abrir caja</Link>}
        </Alert>
      )}
      {menu.data.tables.length === 0 && (
        <Alert tone="info">No hay mesas configuradas. El administrador las crea en Administración → Mesas.</Alert>
      )}
      {areas.map((area) => (
        <section key={area}>
          {area && <h2 className="mb-2 text-sm font-semibold tracking-wide text-slate-500 uppercase">{area}</h2>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {menu.data!.tables.filter((t) => (t.area ?? '') === area).map((t) => {
              const order = byTable.get(t.id);
              return (
                <button key={t.id} disabled={!menu.data!.cashSession && !order}
                  onClick={() => setTarget(order ? { kind: 'order', id: order.id } : { kind: 'new', tableId: t.id, tableName: t.name })}
                  className={clsx('flex aspect-square flex-col items-center justify-center rounded-2xl border-2 p-2 text-center transition disabled:opacity-50',
                    order ? 'border-brand bg-brand/10' : 'border-slate-200 bg-white hover:border-brand')}>
                  <span className="text-lg font-bold">{t.name}</span>
                  {order ? (
                    <>
                      <span className="text-sm font-semibold text-brand-dark tabular-nums">{formatCOP(order.subtotal)}</span>
                      <span className="text-xs text-slate-500">{elapsed(order.createdAt)}</span>
                    </>
                  ) : <span className="text-xs text-emerald-700">Libre</span>}
                </button>
              );
            })}
          </div>
        </section>
      ))}
      {loose.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold tracking-wide text-slate-500 uppercase">Cuentas sin mesa</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {loose.map((o) => (
              <button key={o.id} onClick={() => setTarget({ kind: 'order', id: o.id })} className="text-left">
                <Card className="hover:border-brand">
                  <p className="font-semibold">{o.customerName} · #{o.number}</p>
                  <p className="text-sm text-slate-500">{formatCOP(o.subtotal)} · {elapsed(o.createdAt)}</p>
                </Card>
              </button>
            ))}
          </div>
        </section>
      )}
      {newCustomer && <CustomerModal onClose={() => setNewCustomer(false)} onConfirm={(name) => { setNewCustomer(false); setTarget({ kind: 'new', tableName: name }); }} />}
    </div>
  );
}

function CustomerModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: (name: string) => void }) {
  const [name, setName] = useState('');
  return (
    <Modal open size="sm" onClose={onClose} title="Cuenta sin mesa" footer={<Button disabled={!name.trim()} onClick={() => onConfirm(name.trim())}>Continuar</Button>}>
      <Field label="Nombre del cliente"><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} /></Field>
    </Modal>
  );
}

/** Toma de pedido: abrir una cuenta nueva o agregar productos a una existente. */
function OrderScreen({ menu, target, onBack, onOpened }: { menu: Menu; target: Target; onBack: () => void; onOpened: (id: string) => void }) {
  const { branchId, can } = useAuth();
  const cart = useCart();
  const orderId = target.kind === 'order' ? target.id : null;
  const order = useApi<SaleDetail>(['orders', branchId, orderId], orderId ? `/sales/${orderId}` : null);
  const [adding, setAdding] = useState(target.kind === 'new');
  const [paying, setPaying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const invalidate = { invalidate: [['orders'], ['kitchen'], ['cash'], ['sales']] };

  useEffect(() => { if (order.data && order.data.status !== 'OPEN') onBack(); }, [order.data, onBack]);

  const send = useApiMutation(async () => {
    if (target.kind === 'new') {
      const created = await api<SaleDetail>('/orders', {
        method: 'POST',
        json: { tableId: target.tableId, customerName: target.tableId ? undefined : target.tableName, items: toApiItems(cart.lines) },
      });
      return created;
    }
    return api<SaleDetail>(`/orders/${target.id}/items`, { method: 'POST', json: { items: toApiItems(cart.lines) } });
  }, { ...invalidate, success: 'Pedido enviado' });

  const removeItem = useApiMutation((itemId: string) => api(`/orders/${orderId}/items/${itemId}`, { method: 'DELETE' }), invalidate);
  const pay = useApiMutation((p: PaymentPayload) => api<SaleDetail>(`/orders/${orderId}/pay`, { method: 'POST', json: p }), { ...invalidate, success: 'Cuenta cobrada' });
  const cancel = useApiMutation(() => api(`/orders/${orderId}/cancel`, { method: 'POST', json: { reason } }), { ...invalidate, success: 'Cuenta anulada' });

  const title = target.kind === 'new' ? `Nueva cuenta · ${target.tableName ?? ''}` : order.data ? [order.data.table?.name, order.data.customerName, `#${order.data.number}`].filter(Boolean).join(' · ') : '…';

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" onClick={onBack}><ArrowLeft className="size-4" /> Mesas</Button>
        <h1 className="text-xl font-bold">{title}</h1>
      </div>

      {adding ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
          <div className="h-[calc(100dvh-14rem)] min-h-96"><ProductPicker menu={menu} onAdd={(p, o, q, n) => cart.add(p, o, q, n)} /></div>
          <Card className="h-[calc(100dvh-14rem)] min-h-96">
            <CartView cart={cart}
              header={<p className="mb-2 text-lg font-bold">Productos a enviar</p>}
              footer={
                <div className="space-y-2 border-t border-slate-100 pt-3">
                  <div className="flex justify-between font-bold"><span>Subtotal</span><span className="tabular-nums">{formatCOP(cart.total)}</span></div>
                  <Button className="min-h-12 w-full" disabled={!cart.count} loading={send.isPending}
                    onClick={() => send.mutate(undefined, { onSuccess: (sale) => { cart.clear(); setAdding(false); if (target.kind === 'new') onOpened(sale.id); } })}>
                    Enviar pedido
                  </Button>
                  {target.kind === 'order' && <Button variant="ghost" className="w-full" onClick={() => { cart.clear(); setAdding(false); }}>Cancelar</Button>}
                </div>
              } />
          </Card>
        </div>
      ) : order.data && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Card className="p-0">
            <ul className="divide-y divide-slate-100">
              {order.data.items.map((i) => (
                <li key={i.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{i.quantity} × {i.productName}</p>
                    {i.modifiers.length > 0 && <p className="text-xs text-slate-500">{summarizeNames(i.modifiers.map((m) => m.optionName)).join(', ')}</p>}
                    {i.notes && <p className="text-xs text-amber-700">“{i.notes}”</p>}
                  </div>
                  <span className="font-semibold tabular-nums">{formatCOP(i.lineTotal)}</span>
                  {can('sales.void') && (
                    <Button variant="ghost" aria-label="Quitar" onClick={() => confirm(`¿Quitar ${i.productName}?`) && removeItem.mutate(i.id)}>
                      <Trash2 className="size-4 text-red-600" />
                    </Button>
                  )}
                </li>
              ))}
              {order.data.items.length === 0 && <li className="px-5 py-6 text-center text-sm text-slate-500">Sin productos</li>}
            </ul>
          </Card>
          <Card className="h-fit space-y-3">
            <div className="flex items-baseline justify-between"><span className="text-slate-600">Total</span><span className="text-3xl font-bold tabular-nums">{formatCOP(order.data.subtotal)}</span></div>
            <Button variant="secondary" className="w-full" onClick={() => setAdding(true)}><Plus className="size-4" /> Agregar productos</Button>
            {can('pos.sell') && (
              <Button className="min-h-12 w-full" disabled={!order.data.items.length || !menu.cashSession} onClick={() => setPaying(true)}>
                <Wallet className="size-4" /> Cobrar
              </Button>
            )}
            {can('sales.void') && <Button variant="ghost" className="w-full text-red-600" onClick={() => setCancelling(true)}>Anular cuenta</Button>}
          </Card>
        </div>
      )}

      {paying && order.data && (
        <CheckoutModal subtotal={order.data.subtotal} tipsEnabled={menu.modules.includes('tips')} loading={pay.isPending}
          onClose={() => setPaying(false)}
          onConfirm={(p) => pay.mutate(p, {
            onSuccess: (sale) => {
              setPaying(false);
              const change = sale.payments.reduce((s, x) => s + (x.change ?? 0), 0);
              if (change > 0) toast.success(`Cambio a entregar: ${formatCOP(change)}`);
              onBack();
            },
          })} />
      )}
      {cancelling && (
        <Modal open size="sm" onClose={() => setCancelling(false)} title="Anular cuenta"
          footer={<Button variant="danger" disabled={reason.trim().length < 3} loading={cancel.isPending} onClick={() => cancel.mutate(undefined, { onSuccess: onBack })}>Anular</Button>}>
          <Field label="Motivo"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        </Modal>
      )}
    </div>
  );
}
