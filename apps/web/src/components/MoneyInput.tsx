import type React from 'react';
import { Input } from './ui';

/** Campo de pesos colombianos: muestra separadores de miles y devuelve un entero. */
export function MoneyInput({
  value,
  onChange,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: number; onChange: (v: number) => void }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">$</span>
      <Input
        {...props}
        inputMode="numeric"
        className="pl-7 text-right tabular-nums"
        value={value ? value.toLocaleString('es-CO') : ''}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '').slice(0, 12);
          onChange(digits ? Number(digits) : 0);
        }}
        onFocus={(e) => e.target.select()}
      />
    </div>
  );
}
