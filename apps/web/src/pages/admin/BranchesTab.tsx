import { MapPin, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { Modal } from '../../components/Modal';
import { ModuleChecklist, type ModuleInfo } from '../../components/ModuleChecklist';
import { Badge, Button, Card, Checkbox, Field, Input } from '../../components/ui';
import { api } from '../../lib/api';
import { useApi, useApiMutation } from '../../lib/hooks';

interface Branch {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  isActive: boolean;
  activeModules: string[];
  users: number;
}

export function BranchesTab() {
  const { data } = useApi<{ availableModules: ModuleInfo[]; branches: Branch[] }>(['admin', 'branches'], '/admin/branches');
  const [editing, setEditing] = useState<Branch | 'new' | null>(null);
  if (!data) return null;
  const label = (k: string) => data.availableModules.find((m) => m.key === k)?.label ?? k;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing('new')}><Plus className="size-4" /> Nueva sede</Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {data.branches.map((b) => (
          <Card key={b.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">{b.name} {!b.isActive && <Badge tone="red">Inactiva</Badge>}</p>
                {b.address && <p className="flex items-center gap-1 text-sm text-slate-500"><MapPin className="size-3.5" /> {b.address}</p>}
                <p className="text-xs text-slate-500">{b.users} usuarios asignados</p>
              </div>
              <Button variant="secondary" onClick={() => setEditing(b)}><Pencil className="size-4" /></Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
              {b.activeModules.map((m) => <Badge key={m} tone="brand">{label(m)}</Badge>)}
            </div>
          </Card>
        ))}
      </div>
      {editing && <BranchModal branch={editing === 'new' ? null : editing} modules={data.availableModules} onClose={() => setEditing(null)} />}
    </div>
  );
}

function BranchModal({ branch, modules, onClose }: { branch: Branch | null; modules: ModuleInfo[]; onClose: () => void }) {
  const { reload } = useAuth();
  const [form, setForm] = useState({
    name: branch?.name ?? '',
    address: branch?.address ?? '',
    phone: branch?.phone ?? '',
    isActive: branch?.isActive ?? true,
    activeModules: branch?.activeModules ?? modules.map((m) => m.key),
  });
  const save = useApiMutation(
    () => api(branch ? `/admin/branches/${branch.id}` : '/admin/branches', { method: branch ? 'PUT' : 'POST', json: form }),
    { invalidate: [['admin', 'branches']], success: 'Sede guardada' },
  );
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={branch ? `Editar ${branch.name}` : 'Nueva sede'}
      footer={<Button loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: () => { void reload(); onClose(); } })}>Guardar</Button>}
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Teléfono"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
        </div>
        <Field label="Dirección"><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
        {branch && <Checkbox label="Sede activa" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />}
        <div>
          <p className="mb-1 text-sm font-semibold">Módulos activos en esta sede</p>
          <p className="mb-2 text-xs text-slate-500">Solo aparecen los módulos que el proveedor habilitó para tu negocio.</p>
          <ModuleChecklist modules={modules} value={form.activeModules} onChange={(v) => setForm({ ...form, activeModules: v })} />
        </div>
      </div>
    </Modal>
  );
}
