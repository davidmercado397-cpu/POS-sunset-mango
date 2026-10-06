import clsx from 'clsx';
import { Bike, ChevronUp, MapPin, ShoppingBag, Store } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CartView } from '../../components/pos/CartView';
import { ProductPicker } from '../../components/pos/ProductPicker';
import { toApiItems, type Menu, type PaymentMethod } from '../../components/pos/types';
import { useCart } from '../../components/pos/useCart';
import { Modal } from '../../components/Modal';
import { toast } from '../../components/toast';
import { Alert, Button, Field, Input, Textarea } from '../../components/ui';
import { api } from '../../lib/api';
import { formatCOP } from '../../lib/format';
import { useApi } from '../../lib/hooks';
import { applyBrand } from '../../lib/theme';
import { useStoreBase } from './storeBase';

export interface StoreInfo {
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  branches: { id: string; name: string; address: string | null; open: boolean; allowDelivery: boolean; allowPickup: boolean; deliveryFee: number; minOrder: number; message: string | null; whatsapp: string | null; transferInfo: string | null }[];
  paymentMethods: PaymentMethod[];
}

const CUSTOMER_KEY = 'pos.store.customer';
function loadCustomer() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOMER_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}
function saveCustomer(data: Record<string, string>) {
  try {
    localStorage.setItem(CUSTOMER_KEY, JSON.stringify(data));
  } catch {
    /* sin almacenamiento: solo se pierde el autocompletado */
  }
}

/** Tienda pública para pedidos a domicilio o para recoger. No requiere usuario. */
export function StorePage() {
  const params = useParams();
  const { slug, base } = useStoreBase(params.slug ?? '');
  const store = useApi<StoreInfo>(['store', slug], `/public/store/${slug}`, { refetchInterval: 60_000 });
  const [branchId, setBranchId] = useState<string | null>(null);

  useEffect(() => {
    if (store.data) {
      applyBrand(store.data.primaryColor, store.data.secondaryColor);
      document.title = `${store.data.name} · Pedidos`;
      if (store.data.branches.length === 1) setBranchId(store.data.branches[0].id);
    }
  }, [store.data]);

  if (store.isError) return <div className="flex h-full items-center justify-center p-6 text-center text-slate-500">Esta tienda no está disponible.</div>;
  if (!store.data) return <div className="flex h-full items-center justify-center text-slate-400">Cargando…</div>;
  const branch = store.data.branches.find((b) => b.id === branchId);

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col">
      <header className="flex items-center gap-3 bg-brand px-4 py-3 text-brand-contrast">
        {store.data.logoUrl ? <img src={store.data.logoUrl} alt="" className="size-11 rounded-xl bg-white object-cover" /> : <Store className="size-8" />}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold">{store.data.name}</h1>
          {branch && <p className="truncate text-sm opacity-90">{branch.name}{branch.address && ` · ${branch.address}`}</p>}
        </div>
        {branch && store.data.branches.length > 1 && <button className="text-sm font-semibold underline" onClick={() => setBranchId(null)}>Cambiar sede</button>}
      </header>
      {!branch ? <BranchPicker store={store.data} onPick={setBranchId} /> : <StoreMenu slug={slug} base={base} branch={branch} paymentMethods={store.data.paymentMethods} />}
    </div>
  );
}

function BranchPicker({ store, onPick }: { store: StoreInfo; onPick: (id: string) => void }) {
  if (!store.branches.length) return <p className="p-6 text-center text-slate-500">No hay sedes recibiendo pedidos.</p>;
  return (
    <div className="space-y-3 p-4">
      <h2 className="text-lg font-semibold">¿Desde qué sede quieres pedir?</h2>
      {store.branches.map((b) => (
        <button key={b.id} onClick={() => onPick(b.id)} className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-brand">
          <MapPin className="size-6 text-brand" />
          <div className="flex-1">
            <p className="font-semibold">{b.name}</p>
            {b.address && <p className="text-sm text-slate-500">{b.address}</p>}
          </div>
          <span className={clsx('rounded-full px-2 py-0.5 text-xs font-semibold', b.open ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600')}>{b.open ? 'Abierto' : 'Cerrado'}</span>
        </button>
      ))}
    </div>
  );
}

function StoreMenu({ slug, base, branch, paymentMethods }: { slug: string; base: string; branch: StoreInfo['branches'][number]; paymentMethods: PaymentMethod[] }) {
  const navigate = useNavigate();
  const data = useApi<Pick<Menu, 'categories' | 'products'>>(['store', slug, 'menu', branch.id], `/public/store/${slug}/menu?branchId=${branch.id}`);
  const cart = useCart();
  const [step, setStep] = useState<'menu' | 'cart' | 'checkout'>('menu');
  const menu = useMemo<Menu | null>(() => (data.data ? { ...data.data, cashSession: null, modules: [], tables: [] } : null), [data.data]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!branch.open && <div className="p-3"><Alert>El restaurante está cerrado en este momento. Puedes ver el menú, pero no hacer pedidos.</Alert></div>}
      {branch.open && branch.message && <div className="p-3 pb-0"><Alert tone="info">{branch.message}</Alert></div>}
      <div className="min-h-0 flex-1 p-3">{menu && <ProductPicker menu={menu} onAdd={(p, o, q, n) => cart.add(p, o, q, n)} />}</div>
      {cart.count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-6xl border-t border-slate-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
          <Button className="min-h-14 w-full justify-between text-base" onClick={() => setStep('cart')}>
            <span className="flex items-center gap-2"><ChevronUp className="size-5" /> Ver mi pedido ({cart.count})</span>
            <span className="tabular-nums">{formatCOP(cart.total)}</span>
          </Button>
        </div>
      )}
      <Modal open={step === 'cart'} onClose={() => setStep('menu')} title="Tu pedido"
        footer={<Button className="min-h-12 w-full" disabled={!branch.open || !cart.count} onClick={() => setStep('checkout')}>{branch.open ? 'Continuar' : 'Tienda cerrada'}</Button>}>
        <div className="h-[55dvh]"><CartView cart={cart} footer={<div className="flex justify-between border-t pt-3 font-bold"><span>Subtotal</span><span>{formatCOP(cart.total)}</span></div>} /></div>
      </Modal>
      {step === 'checkout' && (
        <CheckoutForm slug={slug} branch={branch} paymentMethods={paymentMethods} subtotal={cart.total} items={toApiItems(cart.lines)} onBack={() => setStep('cart')}
          onPlaced={(code) => { cart.clear(); navigate(`${base}/pedido/${code}`); }} />
      )}
    </div>
  );
}

const PAY_OPTIONS: { value: PaymentMethod; label: string; hint: string }[] = [
  { value: 'TRANSFER', label: 'Transferencia', hint: 'Transfiere y envía el comprobante por WhatsApp' },
  { value: 'QR_BOLD', label: 'Pago en línea con Bold', hint: 'Tarjeta, PSE o Nequi' },
];

function CheckoutForm({ slug, branch, paymentMethods, subtotal, items, onBack, onPlaced }: {
  slug: string; branch: StoreInfo['branches'][number]; paymentMethods: PaymentMethod[]; subtotal: number; items: ReturnType<typeof toApiItems>; onBack: () => void; onPlaced: (code: string) => void;
}) {
  const saved = loadCustomer();
  const [type, setType] = useState<'DELIVERY' | 'PICKUP'>(branch.allowDelivery ? 'DELIVERY' : 'PICKUP');
  const [form, setForm] = useState({ customerName: saved.customerName ?? '', phone: saved.phone ?? '', address: saved.address ?? '', addressNotes: saved.addressNotes ?? '', notes: '', website: '' });
  const [payment, setPayment] = useState<PaymentMethod>(paymentMethods[0] ?? 'TRANSFER');
  const [sending, setSending] = useState(false);
  const fee = type === 'DELIVERY' ? branch.deliveryFee : 0;
  const total = subtotal + fee;
  const belowMin = subtotal < branch.minOrder;

  async function submit() {
    if (form.customerName.trim().length < 2) return toast.error('Escribe tu nombre');
    if (form.phone.replace(/\D/g, '').length < 7) return toast.error('Escribe un teléfono válido');
    if (type === 'DELIVERY' && form.address.trim().length < 5) return toast.error('Escribe la dirección de entrega');
    setSending(true);
    try {
      const res = await api<{ code: string }>(`/public/store/${slug}/orders`, {
        method: 'POST',
        json: {
          branchId: branch.id, type, ...form,
          address: type === 'DELIVERY' ? form.address : undefined,
          addressNotes: type === 'DELIVERY' ? form.addressNotes || undefined : undefined,
          notes: form.notes || undefined, website: form.website || undefined,
          paymentMethod: payment, items,
        },
      });
      saveCustomer({ customerName: form.customerName, phone: form.phone, address: form.address, addressNotes: form.addressNotes });
      onPlaced(res.code);
    } catch (err) {
      toast.error(err);
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal open onClose={onBack} title="Datos del pedido" size="md"
      footer={<Button className="min-h-12 w-full" loading={sending} disabled={belowMin} onClick={submit}>Hacer pedido · {formatCOP(total)}</Button>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {branch.allowDelivery && (
            <button onClick={() => setType('DELIVERY')} className={clsx('flex min-h-16 flex-col items-center justify-center rounded-xl border font-semibold', type === 'DELIVERY' ? 'border-brand bg-brand/10' : 'border-slate-200')}>
              <Bike className="size-5" /> Domicilio
            </button>
          )}
          {branch.allowPickup && (
            <button onClick={() => setType('PICKUP')} className={clsx('flex min-h-16 flex-col items-center justify-center rounded-xl border font-semibold', type === 'PICKUP' ? 'border-brand bg-brand/10' : 'border-slate-200')}>
              <ShoppingBag className="size-5" /> Recoger en tienda
            </button>
          )}
        </div>
        <Field label="Nombre"><Input value={form.customerName} autoComplete="name" onChange={(e) => setForm({ ...form, customerName: e.target.value })} /></Field>
        <Field label="Celular"><Input value={form.phone} type="tel" autoComplete="tel" inputMode="tel" onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
        {type === 'DELIVERY' && (
          <>
            <Field label="Dirección de entrega"><Input value={form.address} autoComplete="street-address" placeholder="Calle 45 # 12-30" onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
            <Field label="Barrio, apartamento, indicaciones"><Input value={form.addressNotes} onChange={(e) => setForm({ ...form, addressNotes: e.target.value })} /></Field>
          </>
        )}
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">¿Cómo vas a pagar?</p>
          <div className="space-y-2">
            {PAY_OPTIONS.filter((o) => paymentMethods.includes(o.value)).map((o) => (
              <label key={o.value} className={clsx('flex cursor-pointer items-center gap-3 rounded-xl border p-3', payment === o.value ? 'border-brand bg-brand/5' : 'border-slate-200')}>
                <input type="radio" name="pay" className="size-5 accent-[var(--brand)]" checked={payment === o.value} onChange={() => setPayment(o.value)} />
                <span><span className="block font-semibold">{o.label}</span><span className="text-xs text-slate-500">{o.hint}</span></span>
              </label>
            ))}
          </div>
          {payment === 'TRANSFER' && branch.transferInfo && (
            <div className="mt-3 rounded-xl bg-sky-50 p-3 text-sm whitespace-pre-line text-sky-900">
              <p className="font-semibold">Datos para transferir</p>
              {branch.transferInfo}
            </div>
          )}
        </div>
        <Field label="Comentarios (opcional)"><Textarea value={form.notes} maxLength={300} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        {/* Campo oculto para detectar bots */}
        <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
        <div className="space-y-1 rounded-2xl bg-slate-50 p-4 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{formatCOP(subtotal)}</span></div>
          {type === 'DELIVERY' && <div className="flex justify-between"><span>Domicilio</span><span className="tabular-nums">{fee ? formatCOP(fee) : 'Gratis'}</span></div>}
          <div className="flex justify-between text-base font-bold"><span>Total</span><span className="tabular-nums">{formatCOP(total)}</span></div>
        </div>
        {belowMin && <Alert>El pedido mínimo es de {formatCOP(branch.minOrder)}.</Alert>}
      </div>
    </Modal>
  );
}
