import clsx from 'clsx';
import { Check, MessageCircle, XCircle } from 'lucide-react';
import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Card } from '../../components/ui';
import { formatCOP, formatTime, PAYMENT_LABELS } from '../../lib/format';
import { useApi } from '../../lib/hooks';
import { applyBrand } from '../../lib/theme';
import type { StoreInfo } from './StorePage';

interface Tracking {
  code: string;
  status: 'NEW' | 'ACCEPTED' | 'READY' | 'DISPATCHED' | 'COMPLETED' | 'REJECTED' | 'CANCELLED';
  type: 'DELIVERY' | 'PICKUP';
  customerName: string;
  items: { productName: string; quantity: number; lineTotal: number; modifiers: { optionName: string }[] }[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  paymentMethod: string;
  paymentStatus: 'PENDING' | 'PAID' | 'FAILED';
  rejectReason: string | null;
  createdAt: string;
  branch: { name: string; address: string | null; whatsapp: string | null; transferInfo: string | null };
}

/** Seguimiento público del pedido por su código. */
export function TrackPage() {
  const { slug, code = '' } = useParams();
  const { data, isError } = useApi<Tracking>(['track', code], `/public/orders/${code}`, { refetchInterval: 15_000 });
  const store = useApi<StoreInfo>(['store', slug], slug ? `/public/store/${slug}` : null);
  useEffect(() => { if (store.data) applyBrand(store.data.primaryColor, store.data.secondaryColor); }, [store.data]);
  if (isError) return <p className="p-6 text-center text-slate-500">No encontramos ese pedido.</p>;
  if (!data) return <p className="p-6 text-center text-slate-400">Cargando…</p>;

  const steps = data.type === 'DELIVERY'
    ? [['NEW', 'Recibido'], ['ACCEPTED', 'En preparación'], ['READY', 'Listo'], ['DISPATCHED', 'En camino'], ['COMPLETED', 'Entregado']]
    : [['NEW', 'Recibido'], ['ACCEPTED', 'En preparación'], ['READY', 'Listo para recoger'], ['COMPLETED', 'Entregado']];
  const current = steps.findIndex(([s]) => s === data.status);
  const closed = data.status === 'REJECTED' || data.status === 'CANCELLED';
  const wa = data.branch.whatsapp ? `https://wa.me/${data.branch.whatsapp.length === 10 ? `57${data.branch.whatsapp}` : data.branch.whatsapp}?text=${encodeURIComponent(`Hola, mi pedido es ${data.code}`)}` : null;

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <div className="text-center">
        <p className="text-sm text-slate-500">Pedido</p>
        <p className="text-3xl font-bold tracking-widest">{data.code}</p>
        <p className="text-sm text-slate-500">{data.branch.name} · {formatTime(data.createdAt)}</p>
      </div>
      <Card>
        {closed ? (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <XCircle className="size-12 text-red-500" />
            <p className="text-lg font-semibold">{data.status === 'REJECTED' ? 'No pudimos aceptar tu pedido' : 'Pedido cancelado'}</p>
            {data.rejectReason && <p className="text-slate-600">{data.rejectReason}</p>}
          </div>
        ) : (
          <ol className="space-y-4">
            {steps.map(([s, label], i) => (
              <li key={s} className="flex items-center gap-3">
                <span className={clsx('flex size-8 items-center justify-center rounded-full text-sm font-bold', i <= current ? 'bg-brand text-brand-contrast' : 'bg-slate-100 text-slate-400')}>
                  {i < current || data.status === 'COMPLETED' ? <Check className="size-4" /> : i + 1}
                </span>
                <span className={clsx(i === current ? 'font-bold' : i < current ? 'text-slate-700' : 'text-slate-400')}>{label}</span>
              </li>
            ))}
          </ol>
        )}
      </Card>
      <Card className="space-y-2 text-sm">
        {data.items.map((i, idx) => (
          <div key={idx} className="flex justify-between gap-3">
            <span>{i.quantity} × {i.productName}{i.modifiers.length > 0 && <span className="text-slate-500"> ({i.modifiers.map((m) => m.optionName).join(', ')})</span>}</span>
            <span className="tabular-nums">{formatCOP(i.lineTotal)}</span>
          </div>
        ))}
        {data.deliveryFee > 0 && <div className="flex justify-between"><span>Domicilio</span><span className="tabular-nums">{formatCOP(data.deliveryFee)}</span></div>}
        <div className="flex justify-between border-t pt-2 text-base font-bold"><span>Total</span><span className="tabular-nums">{formatCOP(data.total)}</span></div>
        <p className="text-slate-500">
          Pago: {PAYMENT_LABELS[data.paymentMethod]} ·{' '}
          {data.paymentStatus === 'PAID' ? <span className="font-semibold text-emerald-700">Pago confirmado</span> : 'Pendiente de confirmar'}
        </p>
      </Card>
      {data.paymentMethod === 'TRANSFER' && data.paymentStatus !== 'PAID' && !closed && data.branch.transferInfo && (
        <Card className="space-y-1 bg-sky-50 text-sm text-sky-900">
          <p className="font-semibold">Datos para transferir {formatCOP(data.total)}</p>
          <p className="whitespace-pre-line">{data.branch.transferInfo}</p>
          <p className="text-xs">Envía el comprobante por WhatsApp con el código {data.code}.</p>
        </Card>
      )}
      <p className="text-center text-xs text-slate-500">Esta página se actualiza sola. Guarda el código para consultar tu pedido.</p>
      {wa && (
        <a href={wa} target="_blank" rel="noreferrer">
          <Button variant="secondary" className="w-full"><MessageCircle className="size-4" /> Escribir por WhatsApp</Button>
        </a>
      )}
      <Link to={`/pedir/${slug}`} className="block text-center text-sm font-semibold text-brand-dark underline">Hacer otro pedido</Link>
    </div>
  );
}
