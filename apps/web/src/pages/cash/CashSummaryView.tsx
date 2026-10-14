import clsx from 'clsx';
import { Table } from '../../components/ui';
import { formatCOP, PAYMENT_LABELS } from '../../lib/format';
import { METHODS, type CashSummary } from './types';

/** Cuadre por método de pago: esperado, contado y diferencia. */
export function CashSummaryView({ summary }: { summary: CashSummary }) {
  const hasCount = !!summary.counted;
  const creditIn = summary.creditCollected;
  const hasCredit = !!creditIn && METHODS.some((m) => creditIn[m] > 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Ventas" value={formatCOP(summary.salesTotal)} hint={[`${summary.salesCount} ventas`, summary.voidedCount ? `${summary.voidedCount} anuladas` : '', summary.discountsTotal ? `Descuentos ${formatCOP(summary.discountsTotal)}` : '', summary.creditSales ? `Incluye ${formatCOP(summary.creditSales)} a crédito` : ''].filter(Boolean).join(' · ')} />
        <Stat label="Propinas" value={formatCOP(summary.tipsTotal)} hint="Separadas de las ventas" />
        <Stat
          label="Gastos y salidas (efectivo)"
          value={formatCOP(summary.expenses + summary.withdrawals)}
          hint={[summary.expensesTransfer ? `Gastos por transferencia ${formatCOP(summary.expensesTransfer)}` : '', summary.deposits ? `Entradas ${formatCOP(summary.deposits)}` : ''].filter(Boolean).join(' · ') || undefined}
        />
        <Stat label="Base del día" value={formatCOP(summary.openingAmount)} />
      </div>
      {(summary.creditSales || hasCredit) && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {!!summary.creditSales && <Stat label="Vendido a crédito" value={formatCOP(summary.creditSales)} hint="Quedó por cobrar; entra a la caja del día en que lo paguen" />}
          {hasCredit && (
            <Stat
              label="Pagos de créditos recibidos"
              value={formatCOP(METHODS.reduce((s, m) => s + creditIn![m], 0))}
              hint={METHODS.filter((m) => creditIn![m] > 0).map((m) => `${PAYMENT_LABELS[m]} ${formatCOP(creditIn![m])}`).join(' · ')}
            />
          )}
        </div>
      )}
      <Table>
        <thead>
          <tr>
            <th>Método</th>
            <th className="text-right">Ventas</th>
            <th className="text-right">Propinas</th>
            {hasCredit && <th className="text-right">Pagos de créditos</th>}
            <th className="text-right">Esperado</th>
            {hasCount && <th className="text-right">Contado</th>}
            {hasCount && <th className="text-right">Diferencia</th>}
          </tr>
        </thead>
        <tbody>
          {METHODS.map((m) => {
            const diff = summary.difference?.[m] ?? 0;
            return (
              <tr key={m}>
                <td className="font-medium">{PAYMENT_LABELS[m]}</td>
                <td className="text-right tabular-nums">{formatCOP(summary.sales[m])}</td>
                <td className="text-right tabular-nums">{formatCOP(summary.tips[m])}</td>
                {hasCredit && <td className="text-right tabular-nums">{formatCOP(creditIn![m])}</td>}
                <td className="text-right font-semibold tabular-nums">{formatCOP(summary.expected[m])}</td>
                {hasCount && <td className="text-right tabular-nums">{formatCOP(summary.counted![m])}</td>}
                {hasCount && (
                  <td className={clsx('text-right font-bold tabular-nums', diff === 0 ? 'text-emerald-700' : diff > 0 ? 'text-sky-700' : 'text-red-700')}>
                    {diff > 0 ? '+' : ''}{formatCOP(diff)}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </Table>
      <p className="text-xs text-slate-500">
        Efectivo esperado = base + ventas, propinas y pagos de créditos en efectivo + entradas − gastos en efectivo − salidas. Los gastos pagados por transferencia se registran aparte y no cambian lo esperado. Las ventas a crédito cuentan en las ventas pero no en lo esperado hasta que se pagan. Diferencia positiva = sobrante; negativa = faltante.
      </p>
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'brand' }) {
  return (
    <div className={clsx('rounded-2xl border p-4', tone === 'brand' ? 'border-transparent bg-brand text-brand-contrast' : 'border-slate-200 bg-white')}>
      <p className={clsx('text-xs font-semibold tracking-wide uppercase', tone === 'brand' ? 'opacity-80' : 'text-slate-500')}>{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
      {hint && <p className={clsx('text-xs', tone === 'brand' ? 'opacity-80' : 'text-slate-500')}>{hint}</p>}
    </div>
  );
}
