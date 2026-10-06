import { KeyRound, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { Modal } from '../../components/Modal';
import { Badge, Button, Checkbox, Field, Input, Select, Table } from '../../components/ui';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { useApi, useApiMutation } from '../../lib/hooks';

interface User {
  id: string;
  fullName: string;
  username: string;
  email: string | null;
  isActive: boolean;
  role: { id: string; name: string } | null;
  branchIds: string[];
  lastLoginAt: string | null;
  lockedUntil: string | null;
}

interface RoleList { roles: { id: string; name: string }[] }
interface BranchList { branches: { id: string; name: string; isActive: boolean }[] }

export function UsersTab() {
  const users = useApi<User[]>(['admin', 'users'], '/admin/users');
  const roles = useApi<RoleList>(['admin', 'roles'], '/admin/roles');
  const branches = useApi<BranchList>(['admin', 'branches'], '/admin/branches');
  const [editing, setEditing] = useState<User | 'new' | null>(null);
  const [resetting, setResetting] = useState<User | null>(null);
  const branchName = (id: string) => branches.data?.branches.find((b) => b.id === id)?.name ?? '';

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing('new')}><Plus className="size-4" /> Nuevo usuario</Button>
      </div>
      <Table>
        <thead>
          <tr><th>Nombre</th><th>Rol</th><th>Sedes</th><th>Último ingreso</th><th /></tr>
        </thead>
        <tbody>
          {users.data?.map((u) => (
            <tr key={u.id}>
              <td>
                <p className="font-medium">{u.fullName}</p>
                <p className="text-xs text-slate-500">@{u.username}</p>
              </td>
              <td>
                {u.role?.name ?? '—'} {!u.isActive && <Badge tone="red">Inactivo</Badge>}
                {u.lockedUntil && new Date(u.lockedUntil) > new Date() && <Badge tone="amber">Bloqueado</Badge>}
              </td>
              <td className="max-w-56 truncate text-slate-600">{u.branchIds.map(branchName).join(', ') || '—'}</td>
              <td className="text-slate-600">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Nunca'}</td>
              <td className="text-right whitespace-nowrap">
                <Button variant="ghost" onClick={() => setResetting(u)} aria-label="Restablecer contraseña"><KeyRound className="size-4" /></Button>
                <Button variant="ghost" onClick={() => setEditing(u)} aria-label="Editar"><Pencil className="size-4" /></Button>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      {editing && roles.data && branches.data && (
        <UserModal user={editing === 'new' ? null : editing} roles={roles.data.roles} branches={branches.data.branches} onClose={() => setEditing(null)} />
      )}
      {resetting && <ResetPasswordModal user={resetting} onClose={() => setResetting(null)} />}
    </div>
  );
}

function UserModal({ user, roles, branches, onClose }: { user: User | null; roles: RoleList['roles']; branches: BranchList['branches']; onClose: () => void }) {
  const { session } = useAuth();
  const [form, setForm] = useState({
    fullName: user?.fullName ?? '',
    username: user?.username ?? '',
    email: user?.email ?? '',
    password: '',
    roleId: user?.role?.id ?? roles.find((r) => r.name === 'Cajero')?.id ?? roles[0]?.id ?? '',
    branchIds: user?.branchIds ?? (branches.length === 1 ? [branches[0].id] : []),
    isActive: user?.isActive ?? true,
  });
  const save = useApiMutation(
    () =>
      user
        ? api(`/admin/users/${user.id}`, {
            method: 'PATCH',
            json: { fullName: form.fullName, email: form.email || undefined, roleId: form.roleId, branchIds: form.branchIds, isActive: form.isActive },
          })
        : api('/admin/users', { method: 'POST', json: { ...form, email: form.email || undefined, isActive: undefined } }),
    { invalidate: [['admin', 'users']], success: 'Usuario guardado' },
  );
  const toggleBranch = (id: string, on: boolean) =>
    setForm({ ...form, branchIds: on ? [...form.branchIds, id] : form.branchIds.filter((b) => b !== id) });
  const isSelf = user?.id === session?.user.id;

  return (
    <Modal open onClose={onClose} title={user ? 'Editar usuario' : 'Nuevo usuario'} size="lg"
      footer={<Button loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: onClose })}>Guardar</Button>}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre completo"><Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></Field>
          <Field label="Usuario">
            <Input value={form.username} disabled={!!user} autoCapitalize="none" onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </Field>
          <Field label="Correo (opcional)"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          {!user && (
            <Field label="Contraseña">
              <Input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>
          )}
          <Field label="Rol">
            <Select value={form.roleId} disabled={isSelf} onChange={(e) => setForm({ ...form, roleId: e.target.value })}>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </Field>
        </div>
        <div>
          <p className="mb-1 text-sm font-semibold">Sedes donde trabaja</p>
          <div className="grid gap-1 sm:grid-cols-2">
            {branches.map((b) => (
              <Checkbox key={b.id} label={b.name} checked={form.branchIds.includes(b.id)} onChange={(e) => toggleBranch(b.id, e.target.checked)} />
            ))}
          </div>
        </div>
        {user && !isSelf && <Checkbox label="Usuario activo" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />}
      </div>
    </Modal>
  );
}

function ResetPasswordModal({ user, onClose }: { user: User; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const reset = useApiMutation(() => api(`/admin/users/${user.id}/reset-password`, { method: 'POST', json: { password } }), {
    invalidate: [['admin', 'users']],
    success: 'Contraseña restablecida',
  });
  return (
    <Modal open size="sm" onClose={onClose} title={`Contraseña de ${user.fullName}`}
      footer={<Button loading={reset.isPending} onClick={() => reset.mutate(undefined, { onSuccess: onClose })}>Guardar</Button>}>
      <Field label="Nueva contraseña (mínimo 8 caracteres)">
        <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <p className="mt-2 text-xs text-slate-500">También se desbloquea el usuario y se cierran sus sesiones abiertas.</p>
    </Modal>
  );
}
