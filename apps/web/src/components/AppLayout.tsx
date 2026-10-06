import clsx from 'clsx';
import { LogOut, Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ACCOUNT_NAV, visibleNav, type NavItem } from './navigation';

export function AppLayout() {
  const { session, can, hasModule } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  if (!session) return null;
  const items = [...visibleNav(session.user.isSuperAdmin, can, hasModule), ACCOUNT_NAV];

  return (
    <div className="flex h-full">
      {/* Barra lateral fija en escritorio y tablet horizontal */}
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col">
        <Sidebar items={items} />
      </aside>

      {/* Menú deslizable en celular y tablet vertical */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-white shadow-xl">
            <button
              className="absolute top-3 right-3 rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              onClick={() => setOpen(false)}
              aria-label="Cerrar menú"
            >
              <X className="size-5" />
            </button>
            <Sidebar items={items} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onMenu={() => setOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function Brand() {
  const { session } = useAuth();
  const tenant = session?.tenant;
  return (
    <div className="flex items-center gap-3 px-5 py-5">
      {tenant?.logoUrl ? (
        <img src={tenant.logoUrl} alt="" className="size-10 rounded-xl object-cover" />
      ) : (
        <img src="/favicon.svg" alt="" className="size-10" />
      )}
      <div className="min-w-0">
        <p className="truncate font-bold text-slate-900">{tenant?.brandName ?? 'Sunset Mango POS'}</p>
        <p className="truncate text-xs text-slate-500">{tenant ? 'Punto de venta' : 'Administración de plataforma'}</p>
      </div>
    </div>
  );
}

function Sidebar({ items }: { items: NavItem[] }) {
  const { logout, session } = useAuth();
  return (
    <>
      <Brand />
      <nav className="flex-1 space-y-1 overflow-y-auto px-3">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              clsx(
                'flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition',
                isActive ? 'bg-brand text-brand-contrast' : 'text-slate-700 hover:bg-slate-100',
              )
            }
          >
            <item.icon className="size-5 shrink-0" />
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-slate-200 p-3">
        <div className="px-3 pb-2">
          <p className="truncate text-sm font-semibold">{session?.user.fullName}</p>
          <p className="truncate text-xs text-slate-500">
            {session?.user.isSuperAdmin ? 'Super Admin' : (session?.user.role?.name ?? 'Sin rol')}
          </p>
        </div>
        <button
          onClick={() => void logout()}
          className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          <LogOut className="size-5" /> Cerrar sesión
        </button>
      </div>
    </>
  );
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const { session, branchId, setBranchId } = useAuth();
  const branches = session?.branches ?? [];
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
      <button className="-ml-2 rounded-lg p-2 text-slate-700 hover:bg-slate-100 lg:hidden" onClick={onMenu} aria-label="Abrir menú">
        <Menu className="size-6" />
      </button>
      <div className="flex-1" />
      {branches.length > 0 && (
        <label className="flex items-center gap-2 text-sm">
          <span className="hidden text-slate-500 sm:inline">Sede</span>
          <select
            value={branchId ?? ''}
            onChange={(e) => setBranchId(e.target.value)}
            disabled={branches.length === 1}
            className="min-h-10 max-w-48 rounded-xl border border-slate-300 bg-white px-3 font-medium disabled:opacity-100"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </header>
  );
}
