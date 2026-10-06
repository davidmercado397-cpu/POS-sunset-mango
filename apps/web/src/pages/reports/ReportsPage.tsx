import clsx from 'clsx';
import { Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { BarChart, RankList } from '../../components/charts';
import { Button, Card, Field, Input, PageHeader, Select, Table, Tabs } from '../../components/ui';
import { formatCOP, formatQty, PAYMENT_LABELS, todayISO } from '../../lib/format';
import { useApi } from '../../lib/hooks';
import { Stat } from '../cash/CashSummaryView';

interface Summary {
  totals: {
    salesCount: number; salesTotal: number; tips: number; avgTicket: number; voidedCount: number; voidedTotal: number;
    purchases: number; purchasesCount: number; expenses: number; withdrawals: number; cost: number | null; grossProfit: number | null;
    cashSessions: number; differences: Record<string, number>;
  };
  byMethod: { method: string; sales: number; tips: number }[];
  byDay: { day: string; total: number; count: number }[];
  byHour: { hour: number; total: number; count: number }[];
  topProducts: { name: string; category: string | null; quantity: number; total: number }[];
  byCategory: { name: string; total: number; quantity: number }[];
  byUser: { name: string; total: number; count: number; tips: number }[];
  expenses: { type: string; category: string; total: number }[];
  byBranch: { name: string; total: number; count: number }[];
}

interface Margin { id: string; name: string; category: string | null; price: number; cost: number; margin: number; marginPct: number; hasRecipe: boolean }

const shift = (days: number) => new Date(Date.now() - 5 * 3600_000 - days * 86400_000).toISOString().slice(0, 10);
const PRESETS = [
  { label: 'Hoy', from: () => todayISO(), to: () => todayISO() },
  { label: 'Ayer', from: () => shift(1), to: () => shift(1) },
  { label: '7 días', from: () => shift(6), to: () => todayISO() },
  { label: '30 días', from: () => shift(29), to: () => todayISO() },
  { label: 'Este mes', from: () => `${todayISO().slice(0, 8)}01`, to: () => todayISO() },
];

const shortCOP = (v: number) => (v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`);

function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function ReportsPage() {
  const { can, hasModule } = useAuth();
  const [tab, setTab] = useState<'sales' | 'margins'>('sales');
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Reportes" />
      {hasModule('inventory') && (
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'sales', label: 'Ventas y caja' }, { value: 'margins', label: 'Márgenes por producto' }]} />
      )}
      {tab === 'sales' ? <SalesReport canAll={can('branches.manage')} /> : <MarginsReport />}
    </div>
  );
}

function SalesReport({ canAll }: { canAll: boolean }) {
  const { branchId, session } = useAuth();
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());
  const [scope, setScope] = useState<'branch' | 'all'>('branch');
  const { data } = useApi<Summary>(['reports', branchId, from, to, scope], `/reports/summary?from=${from}&to=${to}&scope=${scope}`);

  const days = useMemo(() => {
    if (!data) return [];
    // Completa los días sin ventas para que la serie sea continua.
    const map = new Map(data.byDay.map((d) => [d.day, d]));
    const out = [];
    for (let d = new Date(`${from}T12:00:00Z`); d <= new Date(`${to}T12:00:00Z`) && out.length < 366; d.setUTCDate(d.getUTCDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      const row = map.get(key);
      out.push({ key, label: `${key.slice(8, 10)}/${key.slice(5, 7)}`, value: row?.total ?? 0, hint: `${row?.count ?? 0} ventas` });
    }
    return out;
  }, [data, from, to]);

  const hours = useMemo(() => {
    if (!data?.byHour.length) return [];
    const min = Math.min(...data.byHour.map((h) => h.hour));
    const max = Math.max(...data.byHour.map((h) => h.hour));
    const map = new Map(data.byHour.map((h) => [h.hour, h]));
    return Array.from({ length: max - min + 1 }, (_, i) => {
      const h = min + i;
      return { key: String(h), label: `${h}h`, value: map.get(h)?.total ?? 0, hint: `${map.get(h)?.count ?? 0} ventas` };
    });
  }, [data]);

  const t = data?.totals;
  const totalDiff = t ? Object.values(t.differences).reduce((s, v) => s + v, 0) : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-1">
          {PRESETS.map((p) => (
            <button key={p.label} onClick={() => { setFrom(p.from()); setTo(p.to()); }}
              className={clsx('min-h-11 rounded-xl px-3 text-sm font-semibold', from === p.from() && to === p.to() ? 'bg-brand text-brand-contrast' : 'bg-white ring-1 ring-slate-200')}>
              {p.label}
            </button>
          ))}
        </div>
        <Field label="Desde"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Hasta"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        {canAll && (session?.branches.length ?? 0) > 1 && (
          <Field label="Sedes">
            <Select value={scope} onChange={(e) => setScope(e.target.value as 'branch' | 'all')}>
              <option value="branch">Sede actual</option>
              <option value="all">Todas las sedes</option>
            </Select>
          </Field>
        )}
      </div>

      {!data || !t ? <p className="text-slate-500">Cargando…</p> : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat tone="brand" label="Ventas" value={formatCOP(t.salesTotal)} hint={`${t.salesCount} ventas`} />
            <Stat label="Ticket promedio" value={formatCOP(t.avgTicket)} />
            <Stat label="Propinas" value={formatCOP(t.tips)} />
            <Stat label="Anuladas" value={formatCOP(t.voidedTotal)} hint={`${t.voidedCount} ventas`} />
            <Stat label="Gastos de caja" value={formatCOP(t.expenses)} hint={t.withdrawals ? `Salidas ${formatCOP(t.withdrawals)}` : undefined} />
            {t.purchasesCount > 0 && <Stat label="Compras" value={formatCOP(t.purchases)} hint={`${t.purchasesCount} compras`} />}
            {t.grossProfit != null && <Stat label="Utilidad bruta" value={formatCOP(t.grossProfit)} hint={`Costo de lo vendido ${formatCOP(t.cost ?? 0)}`} />}
            <Stat label="Diferencias de caja" value={formatCOP(totalDiff)} hint={`${t.cashSessions} cierres`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold">Ventas por día</h2>
                <Button variant="ghost" onClick={() => downloadCsv(`ventas-por-dia-${from}-${to}.csv`, [['Fecha', 'Ventas', 'Cantidad'], ...days.map((d) => [d.key, d.value, d.hint ?? ''])])}>
                  <Download className="size-4" /> CSV
                </Button>
              </div>
              <BarChart label="Ventas por día" data={days} format={shortCOP} />
            </Card>
            <Card>
              <h2 className="mb-3 font-semibold">Por método de pago</h2>
              <RankList format={formatCOP} rows={data.byMethod.map((m) => ({ label: PAYMENT_LABELS[m.method], value: m.sales, hint: m.tips ? `+ ${formatCOP(m.tips)} prop.` : undefined }))} />
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="mb-3 font-semibold">Ventas por hora</h2>
              <BarChart label="Ventas por hora" data={hours} format={shortCOP} height={160} />
            </Card>
            <Card>
              <h2 className="mb-3 font-semibold">Por categoría</h2>
              <RankList format={formatCOP} rows={data.byCategory.slice(0, 8).map((c) => ({ label: c.name, value: c.total }))} />
            </Card>
          </div>

          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Productos vendidos</h2>
              <Button variant="ghost" onClick={() => downloadCsv(`productos-${from}-${to}.csv`, [['Producto', 'Categoría', 'Cantidad', 'Total'], ...data.topProducts.map((p) => [p.name, p.category ?? '', p.quantity, p.total])])}>
                <Download className="size-4" /> CSV
              </Button>
            </div>
            <Table>
              <thead><tr><th>Producto</th><th>Categoría</th><th className="text-right">Cantidad</th><th className="text-right">Total</th><th className="text-right">% ventas</th></tr></thead>
              <tbody>
                {data.topProducts.slice(0, 30).map((p) => (
                  <tr key={`${p.name}-${p.category}`}>
                    <td className="font-medium">{p.name}</td>
                    <td className="text-slate-600">{p.category ?? '—'}</td>
                    <td className="text-right tabular-nums">{formatQty(p.quantity)}</td>
                    <td className="text-right tabular-nums">{formatCOP(p.total)}</td>
                    <td className="text-right text-slate-600 tabular-nums">{t.salesTotal ? ((p.total / t.salesTotal) * 100).toFixed(1) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="mb-3 font-semibold">Por vendedor</h2>
              <RankList format={formatCOP} rows={data.byUser.map((u) => ({ label: u.name, value: u.total, hint: `${u.count} ventas` }))} />
            </Card>
            <Card>
              <h2 className="mb-3 font-semibold">Gastos y salidas por categoría</h2>
              <RankList format={formatCOP} rows={data.expenses.map((e) => ({ label: e.category, value: e.total }))} />
            </Card>
          </div>

          {data.byBranch.length > 0 && (
            <Card>
              <h2 className="mb-3 font-semibold">Por sede</h2>
              <RankList format={formatCOP} rows={data.byBranch.map((b) => ({ label: b.name, value: b.total, hint: `${b.count} ventas` }))} />
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function MarginsReport() {
  const { branchId } = useAuth();
  const { data } = useApi<Margin[]>(['reports', 'margins', branchId], '/reports/margins');
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">Costo teórico según la receta base y el costo promedio de los insumos en esta sede (sin variantes).</p>
      <Table>
        <thead><tr><th>Producto</th><th className="text-right">Precio</th><th className="text-right">Costo</th><th className="text-right">Margen</th><th className="text-right">%</th></tr></thead>
        <tbody>
          {data?.map((m) => (
            <tr key={m.id}>
              <td><span className="font-medium">{m.name}</span> <span className="text-xs text-slate-500">{m.category}</span></td>
              <td className="text-right tabular-nums">{formatCOP(m.price)}</td>
              <td className="text-right tabular-nums">{m.hasRecipe ? formatCOP(m.cost) : <span className="text-xs text-slate-400">Sin receta</span>}</td>
              <td className="text-right tabular-nums">{m.hasRecipe ? formatCOP(m.margin) : '—'}</td>
              <td className={clsx('text-right font-semibold tabular-nums', !m.hasRecipe ? '' : m.marginPct < 50 ? 'text-red-700' : 'text-emerald-700')}>{m.hasRecipe ? `${m.marginPct}%` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
