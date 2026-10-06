import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { PageHeader, Tabs } from '../../components/ui';
import { AuditTab } from './AuditTab';
import { BranchesTab } from './BranchesTab';
import { BrandingTab } from './BrandingTab';
import { ExpenseCategoriesTab } from './ExpenseCategoriesTab';
import { PaymentsTab } from './PaymentsTab';
import { RolesTab } from './RolesTab';
import { TablesTab } from './TablesTab';
import { UsersTab } from './UsersTab';

type Tab = 'branches' | 'users' | 'roles' | 'branding' | 'payments' | 'expenses' | 'tables' | 'audit';

export function AdminPage() {
  const { can, session } = useAuth();
  const tablesEnabled = session?.tenant?.enabledModules.includes('tables');
  const tabs = (
    [
      { value: 'branches', label: 'Sedes', show: can('branches.manage') },
      { value: 'users', label: 'Usuarios', show: can('users.manage') },
      { value: 'roles', label: 'Roles y permisos', show: can('roles.manage') },
      { value: 'branding', label: 'Marca', show: can('settings.manage') },
      { value: 'payments', label: 'Pagos en línea', show: can('settings.manage') && session?.tenant?.enabledModules.includes('online') },
      { value: 'expenses', label: 'Categorías de gastos', show: can('expenses.categories') },
      { value: 'tables', label: 'Mesas', show: can('branches.manage') && tablesEnabled },
      { value: 'audit', label: 'Auditoría', show: can('audit.view') },
    ] as { value: Tab; label: string; show: boolean | undefined }[]
  ).filter((t) => t.show);
  const [tab, setTab] = useState<Tab>(tabs[0]?.value ?? 'branches');

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Administración" subtitle={session?.tenant?.name} />
      <Tabs value={tab} onChange={setTab} tabs={tabs} />
      {tab === 'branches' && <BranchesTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'roles' && <RolesTab />}
      {tab === 'branding' && <BrandingTab />}
      {tab === 'payments' && <PaymentsTab />}
      {tab === 'expenses' && <ExpenseCategoriesTab />}
      {tab === 'tables' && <TablesTab />}
      {tab === 'audit' && <AuditTab />}
    </div>
  );
}
