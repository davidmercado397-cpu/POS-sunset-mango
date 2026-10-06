import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { visibleNav } from '../components/navigation';
import { Card } from '../components/ui';

export function HomePage() {
  const { session, can, hasModule } = useAuth();
  if (!session) return null;
  const shortcuts = visibleNav(session.user.isSuperAdmin, can, hasModule).filter((i) => i.to !== '/');
  const firstName = session.user.fullName.split(' ')[0];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Hola, {firstName}</h1>
        <p className="text-slate-500">
          {session.user.isSuperAdmin
            ? 'Administra los negocios de la plataforma.'
            : `Bienvenido a ${session.tenant?.brandName}.`}
        </p>
      </div>

      {!session.user.isSuperAdmin && session.branches.length === 0 && (
        <Card className="border-amber-200 bg-amber-50 text-amber-900">
          No tienes sedes asignadas. Pide al administrador del negocio que te asigne una.
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {shortcuts.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="group flex flex-col items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand hover:shadow-md"
          >
            <span className="rounded-xl bg-brand/10 p-3 text-brand">
              <item.icon className="size-6" />
            </span>
            <span className="font-semibold">{item.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
