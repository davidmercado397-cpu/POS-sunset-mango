import { useState } from 'react';

/**
 * Barras verticales de una sola serie (magnitud): un solo tono, extremos redondeados
 * anclados a la base, separación entre barras, cuadrícula tenue y tooltip al pasar el cursor.
 */
export function BarChart({ data, format, height = 200, label }: {
  data: { key: string; label: string; value: number; hint?: string }[];
  format: (v: number) => string;
  height?: number;
  label: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const ticks = [0, 0.5, 1].map((t) => t * max);
  const showEvery = Math.max(1, Math.ceil(data.length / 12));

  if (!data.length) return <p className="py-10 text-center text-sm text-slate-400">Sin datos en el periodo</p>;
  return (
    <figure aria-label={label} className="relative select-none">
      <div className="flex" style={{ height }}>
        <div className="flex w-16 shrink-0 flex-col justify-between pr-2 text-right text-[11px] text-slate-400 tabular-nums">
          {[...ticks].reverse().map((t) => <span key={t}>{format(t)}</span>)}
        </div>
        <div className="relative flex-1">
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 border-t border-slate-100" style={{ bottom: `${(t / max) * 100}%` }} />
          ))}
          <div className="absolute inset-0 flex items-end gap-[2px]">
            {data.map((d, i) => (
              <div
                key={d.key}
                className="relative flex h-full flex-1 cursor-default items-end justify-center"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onTouchStart={() => setHover(i)}
              >
                <div
                  className="w-full max-w-10 rounded-t bg-brand transition-opacity"
                  style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value > 0 ? 2 : 0, opacity: hover == null || hover === i ? 1 : 0.45 }}
                />
                {hover === i && (
                  <div className="pointer-events-none absolute bottom-full z-10 mb-2 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs whitespace-nowrap text-white shadow-lg">
                    <p className="font-semibold">{d.label}</p>
                    <p className="tabular-nums">{format(d.value)}</p>
                    {d.hint && <p className="text-slate-300">{d.hint}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="ml-16 flex gap-[2px] pt-1">
        {data.map((d, i) => (
          <span key={d.key} className="flex-1 truncate text-center text-[11px] text-slate-500">{i % showEvery === 0 ? d.label : ''}</span>
        ))}
      </div>
    </figure>
  );
}

/** Lista ordenada con barra horizontal proporcional (ranking). */
export function RankList({ rows, format }: { rows: { label: string; value: number; hint?: string }[]; format: (v: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="py-6 text-center text-sm text-slate-400">Sin datos</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} title={`${r.label}: ${format(r.value)}`}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate font-medium text-slate-800">{r.label}</span>
            <span className="shrink-0 text-slate-700 tabular-nums">{format(r.value)}{r.hint && <span className="ml-1 text-xs text-slate-500">{r.hint}</span>}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-slate-100">
            <div className="h-2 rounded-full bg-brand" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
