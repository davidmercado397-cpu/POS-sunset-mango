import clsx from 'clsx';
import { Loader2 } from 'lucide-react';
import type React from 'react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

export function Button({
  variant = 'primary',
  loading,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60',
        variant === 'primary' && 'bg-brand text-brand-contrast shadow-sm hover:brightness-95 active:brightness-90',
        variant === 'secondary' && 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50',
        variant === 'ghost' && 'text-slate-700 hover:bg-slate-100',
        variant === 'danger' && 'bg-red-600 text-white hover:bg-red-700',
        className,
      )}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
      {error && <span className="block text-sm text-red-600">{error}</span>}
    </label>
  );
}

/** Si el llamador fija un ancho (w-20, w-28…), no se fuerza el ancho completo. */
const hasWidth = (className?: string) => !!className && /(^|\s)w-(\d|\[|px|auto|fit|min|max)/.test(className);

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={clsx(
        !hasWidth(className) && 'w-full',
        'block min-h-11 min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-400',
        'focus:border-brand focus:ring-2 focus:ring-brand/30 focus:outline-none',
        className,
      )}
    />
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('rounded-2xl border border-slate-200 bg-white p-5 shadow-sm', className)}>{children}</div>;
}

export function Alert({ tone = 'error', children }: { tone?: 'error' | 'success' | 'info'; children: ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={clsx(
        'rounded-xl px-4 py-3 text-sm',
        tone === 'error' && 'bg-red-50 text-red-800',
        tone === 'success' && 'bg-emerald-50 text-emerald-800',
        tone === 'info' && 'bg-sky-50 text-sky-800',
      )}
    >
      {children}
    </div>
  );
}

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={clsx(
        !hasWidth(className) && 'w-full',
        'block min-h-11 min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900',
        'focus:border-brand focus:ring-2 focus:ring-brand/30 focus:outline-none disabled:bg-slate-100',
        className,
      )}
    >
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={clsx(
        'block min-h-20 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900',
        'focus:border-brand focus:ring-2 focus:ring-brand/30 focus:outline-none',
        className,
      )}
    />
  );
}

export function Badge({ tone = 'slate', children }: { tone?: 'slate' | 'green' | 'red' | 'amber' | 'blue' | 'brand'; children: ReactNode }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap',
        tone === 'slate' && 'bg-slate-100 text-slate-700',
        tone === 'green' && 'bg-emerald-100 text-emerald-800',
        tone === 'red' && 'bg-red-100 text-red-800',
        tone === 'amber' && 'bg-amber-100 text-amber-800',
        tone === 'blue' && 'bg-sky-100 text-sky-800',
        tone === 'brand' && 'bg-brand/15 text-brand-dark',
      )}
    >
      {children}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: string }[] }) {
  return (
    <div className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="inline-flex gap-1 rounded-xl bg-slate-200/70 p-1">
        {tabs.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => onChange(t.value)}
            className={clsx(
              'min-h-9 rounded-lg px-3 text-sm font-semibold whitespace-nowrap transition',
              value === t.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">{children}</div>;
}

export function Checkbox({ label, description, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; description?: ReactNode }) {
  return (
    <label className={clsx('flex items-start gap-3 rounded-xl p-2', props.disabled ? 'opacity-60' : 'cursor-pointer hover:bg-slate-50')}>
      <input type="checkbox" {...props} className="mt-0.5 size-5 shrink-0 rounded accent-[var(--brand)]" />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="block text-xs text-slate-500">{description}</span>}
      </span>
    </label>
  );
}

/** Tabla con desplazamiento horizontal en pantallas pequeñas. */
export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-max text-left text-sm [&_td]:px-4 [&_td]:py-3 [&_th]:px-4 [&_th]:py-3 [&_th]:text-xs [&_th]:font-semibold [&_th]:tracking-wide [&_th]:text-slate-500 [&_th]:uppercase [&_thead]:bg-slate-50 [&_tr]:border-b [&_tr]:border-slate-100 [&_tbody_tr:last-child]:border-0">
        {children}
      </table>
    </div>
  );
}
