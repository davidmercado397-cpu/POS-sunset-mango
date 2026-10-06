import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Alert, Button, Card, Field, Input } from '../components/ui';
import { api } from '../lib/api';

export function AccountPage() {
  const { session, logout } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < 8) return setError('La nueva contraseña debe tener al menos 8 caracteres');
    if (next !== confirm) return setError('Las contraseñas no coinciden');
    setLoading(true);
    try {
      await api('/auth/change-password', { method: 'POST', json: { currentPassword: current, newPassword: next } });
      alert('Contraseña actualizada. Inicia sesión de nuevo.');
      await logout();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar la contraseña');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">Mi cuenta</h1>
      <Card>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-slate-500">Nombre</dt>
          <dd className="font-medium">{session?.user.fullName}</dd>
          <dt className="text-slate-500">Correo / usuario</dt>
          <dd className="font-medium">{session?.user.username}</dd>
          <dt className="text-slate-500">Rol</dt>
          <dd className="font-medium">{session?.user.isSuperAdmin ? 'Super Admin' : (session?.user.role?.name ?? '—')}</dd>
        </dl>
      </Card>
      <Card>
        <h2 className="mb-4 text-lg font-semibold">Cambiar contraseña</h2>
        <form onSubmit={onSubmit} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <Field label="Contraseña actual">
            <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
          </Field>
          <Field label="Nueva contraseña">
            <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required />
          </Field>
          <Field label="Confirmar nueva contraseña">
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
          </Field>
          <Button type="submit" loading={loading}>Guardar</Button>
        </form>
      </Card>
    </div>
  );
}
