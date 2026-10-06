import { CheckCircle2, ChevronUp, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { CartView } from '../../components/pos/CartView';
import { CheckoutModal, type PaymentPayload } from '../../components/pos/CheckoutModal';
import { ProductPicker } from '../../components/pos/ProductPicker';
import { toApiItems, type Menu, type SaleDetail } from '../../components/pos/types';
import { useCart } from '../../components/pos/useCart';
import { Modal } from '../../components/Modal';
import { Alert, Button, Input } from '../../components/ui';
import { api } from '../../lib/api';
import { formatCOP } from '../../lib/format';
import { useApi, useApiMutation } from '../../lib/hooks';

export function PosPage() {
  const { branchId, can } = useAuth();
  const menu = useApi<Menu>(['pos', 'menu', branchId], '/pos/menu');
  const cart = useCart();
  const [customer, setCustomer] = useState('');
  const [checkout, setCheckout] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [done, setDone] = useState<SaleDetail | null>(null);

  const sell = useApiMutation(
    (p: PaymentPayload) => api<SaleDetail>('/sales', { method: 'POST', json: { items: toApiItems(cart.lines), customerName: customer || undefined, ...p } }),
    { invalidate: [['cash'], ['sales'], ['kitchen']] },
  );

  if (menu.isLoading || !menu.data) return <p className="text-slate-500">Cargando menú…</p>;
  const m = menu.data;
  const tipsEnabled = m.modules.includes('tips');

  const cartPanel = (
    <CartView
      cart={cart}
      header={
        <div className="space-y-2 border-b border-slate-100 pb-3">
          <div className="flex items-center justify-between">
            <p className="text-lg font-bold">Pedido</p>
            {cart.count > 0 && <button className="text-sm font-semibold text-red-600" onClick={cart.clear}>Vaciar</button>}
          </div>
          <Input placeholder="Nombre del cliente (opcional)" value={customer} maxLength={80} onChange={(e) => setCustomer(e.target.value)} />
        </div>
      }
      footer={
        <div className="space-y-3 border-t border-slate-100 pt-3">
          <div className="flex items-baseline justify-between">
            <span className="text-slate-600">Total</span>
            <span className="text-2xl font-bold tabular-nums">{formatCOP(cart.total)}</span>
          </div>
          <Button className="min-h-14 w-full text-base" disabled={!cart.count || !m.cashSession} onClick={() => { setCartOpen(false); setCheckout(true); }}>
            Cobrar
          </Button>
        </div>
      }
    />
  );

  return (
    <div className="-m-4 flex h-[calc(100dvh-4rem)] gap-4 p-3 sm:-m-6 sm:p-4">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {!m.cashSession && (
          <Alert tone="error">
            <span className="flex flex-wrap items-center gap-2">
              <Wallet className="size-4" /> No hay caja abierta en esta sede. No se puede vender hasta abrirla.
              {can('cash.open') && <Link to="/caja" className="font-semibold underline">Abrir caja</Link>}
            </span>
          </Alert>
        )}
        <ProductPicker menu={m} onAdd={(p, o, q, n) => cart.add(p, o, q, n)} />
      </div>

      {/* Pedido: panel lateral en pantallas grandes */}
      <aside className="hidden w-96 shrink-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:block">{cartPanel}</aside>

      {/* Pedido: barra inferior y hoja deslizable en celular/tablet */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(0,0,0,0.08)] lg:hidden">
        <Button className="min-h-14 w-full justify-between text-base" disabled={!cart.count} onClick={() => setCartOpen(true)}>
          <span className="flex items-center gap-2"><ChevronUp className="size-5" /> Ver pedido ({cart.count})</span>
          <span className="tabular-nums">{formatCOP(cart.total)}</span>
        </Button>
      </div>
      <Modal open={cartOpen} onClose={() => setCartOpen(false)} title="Pedido" size="md">
        <div className="h-[65dvh]">{cartPanel}</div>
      </Modal>

      {checkout && (
        <CheckoutModal
          subtotal={cart.total}
          tipsEnabled={tipsEnabled}
          loading={sell.isPending}
          onClose={() => setCheckout(false)}
          onConfirm={(p) =>
            sell.mutate(p, {
              onSuccess: (sale) => {
                setCheckout(false);
                setDone(sale);
                cart.clear();
                setCustomer('');
              },
            })
          }
        />
      )}
      {done && <SaleDoneModal sale={done} onClose={() => setDone(null)} />}
    </div>
  );
}

function SaleDoneModal({ sale, onClose }: { sale: SaleDetail; onClose: () => void }) {
  const change = sale.payments.reduce((s, p) => s + (p.change ?? 0), 0);
  return (
    <Modal open onClose={onClose} title="Venta registrada" size="sm" footer={<Button className="w-full" onClick={onClose} autoFocus>Nueva venta</Button>}>
      <div className="space-y-3 py-2 text-center">
        <CheckCircle2 className="mx-auto size-14 text-emerald-500" />
        <p className="text-lg font-semibold">Venta #{sale.number}</p>
        <p className="text-3xl font-bold tabular-nums">{formatCOP(sale.subtotal + sale.tipAmount)}</p>
        {change > 0 && (
          <div className="rounded-2xl bg-emerald-50 p-3">
            <p className="text-sm text-emerald-800">Cambio a entregar</p>
            <p className="text-2xl font-bold text-emerald-700 tabular-nums">{formatCOP(change)}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
