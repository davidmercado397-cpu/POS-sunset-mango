import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, Field, Input, Select } from '../../components/ui';
import { api } from '../../lib/api';
import { useApi, useApiMutation } from '../../lib/hooks';

interface Table { id: string; name: string; area: string | null; isActive: boolean; sortOrder: number }

export function TablesTab() {
  const branches = useApi<{ branches: { id: string; name: string }[] }>(['admin', 'branches'], '/admin/branches');
  const [branchId, setBranchId] = useState('');
  const current = branchId || branches.data?.branches[0]?.id || '';
  const tables = useApi<Table[]>(['admin', 'tables', current], current ? `/admin/branches/${current}/tables` : null);
  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const opts = { invalidate: [['admin', 'tables', current]] };
  const create = useApiMutation(() => api(`/admin/branches/${current}/tables`, { method: 'POST', json: { name, area: area || undefined, sortOrder: tables.data?.length ?? 0 } }), { ...opts, success: 'Mesa creada' });
  const toggle = useApiMutation((t: Table) => api(`/admin/branches/${current}/tables/${t.id}`, { method: 'PUT', json: { name: t.name, area: t.area ?? undefined, isActive: !t.isActive } }), opts);

  return (
    <Card className="max-w-3xl space-y-4">
      <p className="text-sm text-slate-500">Las mesas se usan cuando el módulo "Mesas y pedidos abiertos" está activo en la sede.</p>
      <Field label="Sede">
        <Select value={current} onChange={(e) => setBranchId(e.target.value)}>
          {branches.data?.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
      </Field>
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate(undefined, { onSuccess: () => setName('') }); }}>
        <Input className="flex-1" value={name} placeholder="Nombre (ej. Mesa 1)" onChange={(e) => setName(e.target.value)} />
        <Input className="w-40" value={area} placeholder="Zona (opcional)" onChange={(e) => setArea(e.target.value)} />
        <Button type="submit" loading={create.isPending}><Plus className="size-4" /> Agregar</Button>
      </form>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tables.data?.map((t) => (
          <button key={t.id} onClick={() => toggle.mutate(t)} className={`rounded-xl border p-3 text-left ${t.isActive ? 'border-slate-200' : 'border-dashed opacity-60'}`}>
            <p className="font-semibold">{t.name}</p>
            <p className="text-xs text-slate-500">{t.area ?? 'Sin zona'}</p>
            {!t.isActive && <Badge>Inactiva</Badge>}
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-500">Toca una mesa para activarla o desactivarla.</p>
    </Card>
  );
}
