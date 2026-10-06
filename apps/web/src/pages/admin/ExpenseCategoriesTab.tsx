import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, Input } from '../../components/ui';
import { api } from '../../lib/api';
import { useApi, useApiMutation } from '../../lib/hooks';

interface Category { id: string; name: string; isActive: boolean }

export function ExpenseCategoriesTab() {
  const { data } = useApi<Category[]>(['admin', 'expense-categories'], '/admin/expense-categories');
  const [name, setName] = useState('');
  const opts = { invalidate: [['admin', 'expense-categories']] };
  const create = useApiMutation(() => api('/admin/expense-categories', { method: 'POST', json: { name } }), { ...opts, success: 'Categoría creada' });
  const toggle = useApiMutation((c: Category) => api(`/admin/expense-categories/${c.id}`, { method: 'PUT', json: { name: c.name, isActive: !c.isActive } }), opts);
  return (
    <Card className="max-w-2xl space-y-4">
      <p className="text-sm text-slate-500">Al registrar un gasto se elige una de estas categorías y se puede escribir una descripción libre.</p>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate(undefined, { onSuccess: () => setName('') }); }}>
        <Input value={name} placeholder="Nueva categoría" onChange={(e) => setName(e.target.value)} />
        <Button type="submit" loading={create.isPending}><Plus className="size-4" /> Agregar</Button>
      </form>
      <ul className="divide-y divide-slate-100">
        {data?.map((c) => (
          <li key={c.id} className="flex items-center justify-between py-2">
            <span className={c.isActive ? '' : 'text-slate-400 line-through'}>{c.name}</span>
            <div className="flex items-center gap-2">
              {!c.isActive && <Badge>Inactiva</Badge>}
              <Button variant="ghost" onClick={() => toggle.mutate(c)}>{c.isActive ? 'Desactivar' : 'Activar'}</Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
