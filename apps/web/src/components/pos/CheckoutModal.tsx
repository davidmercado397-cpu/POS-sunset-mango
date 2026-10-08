import clsx from 'clsx';
import { Banknote, Landmark, QrCode, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Modal } from '../Modal';
import { MoneyInput } from '../MoneyInput';
import { Alert, Button, Field, Input } from '../ui';
import { formatCOP, PAYMENT_LABELS } from '../../lib/format';
import type { PaymentMethod } from './types';

export interface PaymentPayload {
  payments: { method: PaymentMethod; amount: number; received?: number; reference?: string }[];
  tipAmount: number;
  tipMethod?: PaymentMethod;
  discount?: number;
  discountNote?: string;
}

interface Row { method: PaymentMethod; amount: number; received: number; reference: string }

const METHODS: { method: PaymentMethod; icon: typeof Banknote }[] = [
  { method: 'CASH', icon: Banknote },
  { method: 'TRANSFER', icon: Landmark },
  { method: 'QR_BOLD', icon: QrCode },
];

/** Cobro con uno o varios métodos de pago, propina opcional y cálculo del cambio. */
export function CheckoutModal({ subtotal: gross, tipsEnabled, allowDiscount = false, loading, onClose, onConfirm, defaultMethod = 'CASH', defaultReceived = 0 }: {
  subtotal: number; tipsEnabled: boolean; allowDiscount?: boolean; loading: boolean; onClose: () => void; onConfirm: (p: PaymentPayload) => void;
  defaultMethod?: PaymentMethod; defaultReceived?: number;
}) {
  const [tip, setTip] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [discountNote, setDiscountNote] = useState('');
  const [tipMethod, setTipMethod] = useState<PaymentMethod | ''>('');
  const [rows, setRows] = useState<Row[]>([{ method: defaultMethod, amount: gross, received: defaultMethod === 'CASH' ? defaultReceived : 0, reference: '' }]);
  const subtotal = gross - discount;
  const total = subtotal + tip;
  const paid = rows.reduce((s, r) => s + r.amount, 0);
  const remaining = total - paid;

  const update = (i: number, patch: Partial<Row>) => setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const setSingle = (method: PaymentMethod) => setRows([{ method, amount: total, received: 0, reference: '' }]);
  const addRow = (method: PaymentMethod) => setRows([...rows, { method, amount: Math.max(0, remaining), received: 0, reference: '' }]);

  // Si cambia la propina con un solo método, el valor se ajusta solo.
  const changeTip = (value: number) => {
    setTip(value);
    if (rows.length === 1) setRows([{ ...rows[0], amount: subtotal + value }]);
  };
  // Igual con el descuento: el pago único pasa a ser el nuevo total.
  const changeDiscount = (value: number) => {
    setDiscount(value);
    if (rows.length === 1) setRows([{ ...rows[0], amount: gross - value + tip }]);
  };

  const cashRow = rows.find((r) => r.method === 'CASH');
  const change = cashRow && cashRow.received > cashRow.amount ? cashRow.received - cashRow.amount : 0;
  const methodsUsed = [...new Set(rows.map((r) => r.method))];
  const effectiveTipMethod = tip > 0 ? (tipMethod && methodsUsed.includes(tipMethod) ? tipMethod : methodsUsed[0]) : undefined;

  const quick = useMemo(() => {
    if (!cashRow) return [];
    const amount = cashRow.amount;
    const roundUp = (n: number) => Math.ceil(amount / n) * n;
    return [...new Set([amount, roundUp(5000), roundUp(10000), roundUp(50000), 100000].filter((v) => v >= amount))].slice(0, 5);
  }, [cashRow]);

  const errors: string[] = [];
  if (discount >= gross && discount > 0) errors.push('El descuento debe ser menor que el valor de los productos');
  if (remaining !== 0) errors.push(remaining > 0 ? `Faltan ${formatCOP(remaining)}` : `Sobran ${formatCOP(-remaining)}`);
  if (cashRow && cashRow.received > 0 && cashRow.received < cashRow.amount) errors.push('El efectivo recibido es menor al valor en efectivo');
  if (rows.some((r) => r.amount <= 0)) errors.push('Hay pagos en cero');

  function confirm() {
    onConfirm({
      payments: rows.map((r) => ({
        method: r.method,
        amount: r.amount,
        received: r.method === 'CASH' && r.received ? r.received : undefined,
        reference: r.method !== 'CASH' && r.reference.trim() ? r.reference.trim() : undefined,
      })),
      tipAmount: tip,
      tipMethod: effectiveTipMethod,
      ...(discount > 0 ? { discount, discountNote: discountNote.trim() || undefined } : {}),
    });
  }

  return (
    <Modal open onClose={onClose} title="Cobrar" size="md"
      footer={<Button className="w-full" disabled={errors.length > 0} loading={loading} onClick={confirm}>Confirmar pago {formatCOP(total)}</Button>}>
      <div className="space-y-5">
        <div className="rounded-2xl bg-slate-900 p-4 text-white">
          {discount > 0 && (
            <>
              <div className="flex justify-between text-sm text-slate-300"><span>Productos</span><span>{formatCOP(gross)}</span></div>
              <div className="flex justify-between text-sm text-emerald-300"><span>Descuento</span><span>−{formatCOP(discount)}</span></div>
            </>
          )}
          <div className="flex justify-between text-sm text-slate-300"><span>Subtotal</span><span>{formatCOP(subtotal)}</span></div>
          {tip > 0 && <div className="flex justify-between text-sm text-slate-300"><span>Propina</span><span>{formatCOP(tip)}</span></div>}
          <div className="mt-1 flex items-baseline justify-between"><span className="text-lg">Total</span><span className="text-3xl font-bold tabular-nums">{formatCOP(total)}</span></div>
        </div>

        {allowDiscount && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Descuento en dinero (opcional)"><MoneyInput value={discount} onChange={changeDiscount} placeholder="0" /></Field>
            {discount > 0 && <Field label="Motivo del descuento (opcional)"><Input value={discountNote} maxLength={120} onChange={(e) => setDiscountNote(e.target.value)} /></Field>}
          </div>
        )}

        {tipsEnabled && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Propina recibida (opcional)"><MoneyInput value={tip} onChange={changeTip} placeholder="0" /></Field>
            {tip > 0 && methodsUsed.length > 1 && (
              <Field label="La propina se pagó con">
                <select className="min-h-11 w-full rounded-xl border border-slate-300 px-3" value={effectiveTipMethod} onChange={(e) => setTipMethod(e.target.value as PaymentMethod)}>
                  {methodsUsed.map((m) => <option key={m} value={m}>{PAYMENT_LABELS[m]}</option>)}
                </select>
              </Field>
            )}
          </div>
        )}

        <div>
          <p className="mb-2 text-sm font-semibold">Pago rápido</p>
          <div className="grid grid-cols-3 gap-2">
            {METHODS.map(({ method, icon: Icon }) => (
              <button key={method} onClick={() => setSingle(method)}
                className={clsx('flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border text-sm font-semibold',
                  rows.length === 1 && rows[0].method === method ? 'border-brand bg-brand/10' : 'border-slate-200')}>
                <Icon className="size-5" /> {PAYMENT_LABELS[method]}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={i} className="space-y-3 rounded-2xl border border-slate-200 p-3">
              <div className="flex items-center gap-2">
                <select className="min-h-11 rounded-xl border border-slate-300 px-2 font-semibold" value={r.method} onChange={(e) => update(i, { method: e.target.value as PaymentMethod })}>
                  {METHODS.map(({ method }) => <option key={method} value={method}>{PAYMENT_LABELS[method]}</option>)}
                </select>
                <div className="flex-1"><MoneyInput value={r.amount} onChange={(amount) => update(i, { amount })} /></div>
                {rows.length > 1 && <Button variant="ghost" onClick={() => setRows(rows.filter((_, idx) => idx !== i))} aria-label="Quitar"><Trash2 className="size-4 text-red-600" /></Button>}
              </div>
              {r.method === 'CASH' ? (
                <div className="space-y-2">
                  <Field label="Recibido del cliente"><MoneyInput value={r.received} onChange={(received) => update(i, { received })} placeholder="Igual al valor" /></Field>
                  <div className="flex flex-wrap gap-2">
                    {quick.map((v) => (
                      <button key={v} onClick={() => update(i, { received: v })} className="min-h-10 rounded-lg bg-slate-100 px-3 text-sm font-semibold hover:bg-slate-200">{formatCOP(v)}</button>
                    ))}
                  </div>
                </div>
              ) : (
                <Field label="Referencia (opcional)"><Input value={r.reference} maxLength={60} onChange={(e) => update(i, { reference: e.target.value })} /></Field>
              )}
            </div>
          ))}
          {remaining > 0 && (
            <div className="flex flex-wrap gap-2">
              <span className="self-center text-sm text-slate-500">Agregar otro método:</span>
              {METHODS.map(({ method }) => <Button key={method} variant="secondary" onClick={() => addRow(method)}>+ {PAYMENT_LABELS[method]}</Button>)}
            </div>
          )}
        </div>

        {change > 0 && (
          <div className="rounded-2xl bg-emerald-50 p-4 text-center">
            <p className="text-sm text-emerald-800">Cambio a entregar</p>
            <p className="text-3xl font-bold text-emerald-700 tabular-nums">{formatCOP(change)}</p>
          </div>
        )}
        {errors.length > 0 && <Alert>{errors.join('. ')}</Alert>}
      </div>
    </Modal>
  );
}
