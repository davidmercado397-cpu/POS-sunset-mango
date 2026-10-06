import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { Modal } from '../../components/Modal';
import { Badge, Button, Card, Checkbox, Field, Input } from '../../components/ui';
import { api } from '../../lib/api';
import { useApi, useApiMutation } from '../../lib/hooks';

interface Role { id: string; name: string; description: string | null; permissions: string[]; isSystem: boolean; users: number }
interface PermissionInfo { key: string; label: string; group: string }

export function RolesTab() {
  const { data } = useApi<{ catalog: PermissionInfo[]; roles: Role[] }>(['admin', 'roles'], '/admin/roles');
  const [editing, setEditing] = useState<Role | 'new' | null>(null);
  const del = useApiMutation((id: string) => api(`/admin/roles/${id}`, { method: 'DELETE' }), { invalidate: [['admin', 'roles']], success: 'Rol eliminado' });
  if (!data) return null;
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={() => setEditing('new')}><Plus className="size-4" /> Nuevo rol</Button></div>
      <div className="grid gap-3 md:grid-cols-2">
        {data.roles.map((r) => (
          <Card key={r.id}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold">{r.name} {r.isSystem && <Badge>Base</Badge>}</p>
                <p className="text-sm text-slate-500">{r.description}</p>
                <p className="mt-1 text-xs text-slate-500">{r.permissions.length} permisos · {r.users} usuarios</p>
              </div>
              <div className="flex shrink-0">
                <Button variant="ghost" onClick={() => setEditing(r)} aria-label="Editar"><Pencil className="size-4" /></Button>
                {!r.isSystem && (
                  <Button variant="ghost" aria-label="Eliminar" onClick={() => confirm(`¿Eliminar el rol ${r.name}?`) && del.mutate(r.id)}>
                    <Trash2 className="size-4 text-red-600" />
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
      {editing && <RoleModal role={editing === 'new' ? null : editing} catalog={data.catalog} onClose={() => setEditing(null)} />}
    </div>
  );
}

function RoleModal({ role, catalog, onClose }: { role: Role | null; catalog: PermissionInfo[]; onClose: () => void }) {
  const { reload } = useAuth();
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [perms, setPerms] = useState<string[]>(role?.permissions ?? []);
  const save = useApiMutation(
    () => api(role ? `/admin/roles/${role.id}` : '/admin/roles', { method: role ? 'PUT' : 'POST', json: { name, description, permissions: perms } }),
    { invalidate: [['admin', 'roles']], success: 'Rol guardado' },
  );
  const groups = [...new Set(catalog.map((p) => p.group))];
  return (
    <Modal open onClose={onClose} size="lg" title={role ? `Rol: ${role.name}` : 'Nuevo rol'}
      footer={<Button loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: () => { void reload(); onClose(); } })}>Guardar</Button>}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Descripción"><Input value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        </div>
        {groups.map((g) => (
          <div key={g}>
            <p className="mb-1 text-sm font-semibold text-slate-700">{g}</p>
            <div className="grid gap-0.5 sm:grid-cols-2">
              {catalog.filter((p) => p.group === g).map((p) => (
                <Checkbox key={p.key} label={p.label} checked={perms.includes(p.key)}
                  onChange={(e) => setPerms(e.target.checked ? [...perms, p.key] : perms.filter((x) => x !== p.key))} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
