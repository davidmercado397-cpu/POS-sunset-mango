import { Minus, Plus } from 'lucide-react';
import { formatCOP } from '../lib/format';

/** Conteo de billetes y monedas COP. */
export function DenominationCounter({ denominations, value, onChange }: { denominations: number[]; value: Record<string, number>; onChange: (v: Record<string, number>) => void }) {
  const total = denominations.reduce((s, d) => s + d * (value[d] ?? 0), 0);
  const set = (d: number, n: number) => onChange({ ...value, [d]: Math.max(0, Math.min(99999, n)) });
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        {denominations.map((d) => (
          <div key={d} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5">
            <span className={`w-20 text-sm font-semibold ${d >= 2000 ? 'text-emerald-700' : 'text-amber-700'}`}>{formatCOP(d)}</span>
            <button type="button" className="rounded-lg p-2 hover:bg-slate-100" onClick={() => set(d, (value[d] ?? 0) - 1)} aria-label="Menos"><Minus className="size-4" /></button>
            <input
              inputMode="numeric"
              className="w-14 rounded-lg border border-slate-200 py-1.5 text-center tabular-nums"
              value={value[d] ?? 0}
              onFocus={(e) => e.target.select()}
              onChange={(e) => set(d, Number(e.target.value.replace(/\D/g, '')) || 0)}
            />
            <button type="button" className="rounded-lg p-2 hover:bg-slate-100" onClick={() => set(d, (value[d] ?? 0) + 1)} aria-label="Más"><Plus className="size-4" /></button>
            <span className="ml-auto text-sm text-slate-500 tabular-nums">{formatCOP(d * (value[d] ?? 0))}</span>
          </div>
        ))}
      </div>
      <div className="flex justify-between rounded-xl bg-slate-100 px-4 py-3 font-bold">
        <span>Total contado</span>
        <span className="tabular-nums">{formatCOP(total)}</span>
      </div>
    </div>
  );
}

export const countTotal = (denominations: number[], value: Record<string, number>) => denominations.reduce((s, d) => s + d * (value[d] ?? 0), 0);
