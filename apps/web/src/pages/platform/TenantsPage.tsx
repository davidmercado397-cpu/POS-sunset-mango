import { Building2, KeyRound, Plus } from 'lucide-react';
import { useState } from 'react';
import { Modal } from '../../components/Modal';
import { ModuleChecklist, type ModuleInfo } from '../../components/ModuleChecklist';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, PageHeader, Tabs } from '../../components/ui';
import { api } from '../../lib/api';
import { formatDate, formatDateTime } from '../../lib/format';
import { useApi, useApiMutation } from '../../lib/hooks';

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  enabledModules: string[];
  logoUrl: string | null;
  primaryColor: string;
  createdAt: string;
  branches: number;
  users: number;
}

interface TenantDetail {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  enabledModules: string[];
  branches: { id: string; name: string; isActive: boolean }[];
  users: { id: string; fullName: string; username: string; isActive: boolean; role: string | null; lastLoginAt: string | null }[];
}

export function TenantsPage() {
  const tenants = useApi<TenantRow[]>(['platform', 'tenants'], '/platform/tenants');
  const modules = useApi<ModuleInfo[]>(['platform', 'modules'], '/platform/modules');
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Negocios"
        subtitle="Clientes de la plataforma y los módulos que tiene disponibles cada uno"
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" /> Nuevo negocio
          </Button>
        }
      />
      {tenants.data?.length === 0 && <EmptyState>Aún no hay negocios. Crea el primero.</EmptyState>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tenants.data?.map((t) => (
          <button key={t.id} onClick={() => setSelected(t.id)} className="text-left">
            <Card className="h-full transition hover:border-brand hover:shadow-md">
              <div className="flex items-start gap-3">
                {t.logoUrl ? (
                  <img src={t.logoUrl} alt="" className="size-12 rounded-xl object-cover" />
                ) : (
                  <span className="flex size-12 items-center justify-center rounded-xl text-white" style={{ background: t.primaryColor }}>
                    <Building2 className="size-6" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{t.name}</p>
                  <p className="text-xs text-slate-500">Desde {formatDate(t.createdAt)}</p>
                </div>
                {t.isActive ? <Badge tone="green">Activo</Badge> : <Badge tone="red">Suspendido</Badge>}
              </div>
              <p className="mt-3 text-sm text-slate-600">
                {t.branches} {t.branches === 1 ? 'sede' : 'sedes'} · {t.users} {t.users === 1 ? 'usuario' : 'usuarios'} · {t.enabledModules.length} módulos
              </p>
            </Card>
          </button>
        ))}
      </div>
      {creating && modules.data && <CreateTenantModal modules={modules.data} onClose={() => setCreating(false)} />}
      {selected && modules.data && <TenantModal id={selected} modules={modules.data} onClose={() => setSelected(null)} />}
    </div>
  );
}

function CreateTenantModal({ modules, onClose }: { modules: ModuleInfo[]; onClose: () => void }) {
  const [name, setName] = useState('');
  const [branchName, setBranchName] = useState('Sede principal');
  const [admin, setAdmin] = useState({ fullName: '', username: '', password: '' });
  const [enabled, setEnabled] = useState<string[]>(modules.map((m) => m.key).filter((k) => k !== 'tables'));
  const create = useApiMutation((body: unknown) => api('/platform/tenants', { method: 'POST', json: body }), {
    invalidate: [['platform', 'tenants']],
    success: 'Negocio creado',
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Nuevo negocio"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button
            loading={create.isPending}
            onClick={() => create.mutate({ name, branchName, enabledModules: enabled, admin }, { onSuccess: onClose })}
          >
            Crear negocio
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre del negocio">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Sunset Mango" />
          </Field>
          <Field label="Primera sede">
            <Input value={branchName} onChange={(e) => setBranchName(e.target.value)} />
          </Field>
        </div>
        <fieldset className="space-y-3 rounded-2xl border border-slate-200 p-4">
          <legend className="px-1 text-sm font-semibold">Usuario administrador del negocio</legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Nombre completo">
              <Input value={admin.fullName} onChange={(e) => setAdmin({ ...admin, fullName: e.target.value })} />
            </Field>
            <Field label="Correo de ingreso">
              <Input value={admin.username} autoCapitalize="none" inputMode="email" placeholder="admin@negocio.com" onChange={(e) => setAdmin({ ...admin, username: e.target.value })} />
            </Field>
            <Field label="Contraseña">
              <Input type="password" value={admin.password} autoComplete="new-password" onChange={(e) => setAdmin({ ...admin, password: e.target.value })} />
            </Field>
          </div>
        </fieldset>
        <div>
          <p className="mb-2 text-sm font-semibold">Seguridad: módulos disponibles</p>
          <ModuleChecklist modules={modules} value={enabled} onChange={setEnabled} />
        </div>
      </div>
    </Modal>
  );
}

function TenantModal({ id, modules, onClose }: { id: string; modules: ModuleInfo[]; onClose: () => void }) {
  const detail = useApi<TenantDetail>(['platform', 'tenant', id], `/platform/tenants/${id}`);
  const [tab, setTab] = useState<'general' | 'security' | 'users'>('general');
  const t = detail.data;

  return (
    <Modal open onClose={onClose} title={t?.name ?? 'Negocio'} size="lg">
      {!t ? (
        <p className="text-sm text-slate-500">Cargando…</p>
      ) : (
        <>
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'general', label: 'General' },
              { value: 'security', label: 'Seguridad' },
              { value: 'users', label: 'Usuarios' },
            ]}
          />
          {tab === 'general' && <TenantGeneral tenant={t} />}
          {tab === 'security' && <TenantSecurity tenant={t} modules={modules} />}
          {tab === 'users' && <TenantUsers tenant={t} />}
        </>
      )}
    </Modal>
  );
}

function useUpdateTenant(id: string) {
  return useApiMutation((body: unknown) => api(`/platform/tenants/${id}`, { method: 'PATCH', json: body }), {
    invalidate: [['platform']],
    success: 'Cambios guardados',
  });
}

function TenantGeneral({ tenant }: { tenant: TenantDetail }) {
  const [name, setName] = useState(tenant.name);
  const update = useUpdateTenant(tenant.id);
  return (
    <div className="space-y-5">
      <Field label="Nombre">
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
          <Button loading={update.isPending} onClick={() => update.mutate({ name })}>Guardar</Button>
        </div>
      </Field>
      <div>
        <p className="mb-1 text-sm font-semibold">Sedes</p>
        <ul className="text-sm text-slate-600">
          {tenant.branches.map((b) => (
            <li key={b.id}>• {b.name} {!b.isActive && <Badge tone="red">Inactiva</Badge>}</li>
          ))}
        </ul>
      </div>
      <Card className={tenant.isActive ? 'border-red-200' : 'border-emerald-200'}>
        <p className="font-semibold">{tenant.isActive ? 'Suspender negocio' : 'Reactivar negocio'}</p>
        <p className="mb-3 text-sm text-slate-500">
          {tenant.isActive
            ? 'Los usuarios del negocio no podrán ingresar y se cerrarán sus sesiones. Los datos se conservan.'
            : 'Los usuarios podrán volver a ingresar.'}
        </p>
        <Button
          variant={tenant.isActive ? 'danger' : 'primary'}
          loading={update.isPending}
          onClick={() => {
            if (!tenant.isActive || confirm(`¿Suspender ${tenant.name}?`)) update.mutate({ isActive: !tenant.isActive });
          }}
        >
          {tenant.isActive ? 'Suspender' : 'Reactivar'}
        </Button>
      </Card>
    </div>
  );
}

function TenantSecurity({ tenant, modules }: { tenant: TenantDetail; modules: ModuleInfo[] }) {
  const [enabled, setEnabled] = useState(tenant.enabledModules);
  const update = useUpdateTenant(tenant.id);
  return (
    <div className="space-y-4">
      <Alert tone="info">
        Define qué partes del aplicativo puede usar este negocio. Su administrador decide luego cuáles activar en cada sede. Si retiras un módulo, se
        apaga en todas sus sedes.
      </Alert>
      <ModuleChecklist modules={modules} value={enabled} onChange={setEnabled} />
      <div className="flex justify-end">
        <Button loading={update.isPending} onClick={() => update.mutate({ enabledModules: enabled })}>Guardar seguridad</Button>
      </div>
    </div>
  );
}

function TenantUsers({ tenant }: { tenant: TenantDetail }) {
  const [target, setTarget] = useState<TenantDetail['users'][number] | null>(null);
  const [password, setPassword] = useState('');
  const reset = useApiMutation(
    (vars: { userId: string; password: string }) =>
      api(`/platform/tenants/${tenant.id}/users/${vars.userId}/reset-password`, { method: 'POST', json: { password: vars.password } }),
    { success: 'Contraseña restablecida' },
  );
  return (
    <div className="space-y-2">
      {tenant.users.map((u) => (
        <div key={u.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{u.fullName} {!u.isActive && <Badge tone="red">Inactivo</Badge>}</p>
            <p className="truncate text-xs text-slate-500">
              {u.username} · {u.role ?? 'Sin rol'} · {u.lastLoginAt ? `Último ingreso ${formatDateTime(u.lastLoginAt)}` : 'Nunca ha ingresado'}
            </p>
          </div>
          <Button variant="secondary" onClick={() => { setTarget(u); setPassword(''); }}>
            <KeyRound className="size-4" /> <span className="hidden sm:inline">Restablecer</span>
          </Button>
        </div>
      ))}
      {target && (
        <Modal
          open
          size="sm"
          onClose={() => setTarget(null)}
          title={`Nueva contraseña para ${target.fullName}`}
          footer={
            <Button loading={reset.isPending} onClick={() => reset.mutate({ userId: target.id, password }, { onSuccess: () => setTarget(null) })}>
              Guardar
            </Button>
          }
        >
          <Field label="Contraseña (mínimo 8 caracteres)">
            <Input type="password" value={password} autoComplete="new-password" onChange={(e) => setPassword(e.target.value)} />
          </Field>
        </Modal>
      )}
    </div>
  );
}
