import clsx from 'clsx';
import { Bell, BellOff, CheckCheck, Maximize, Wifi, WifiOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { Alert, Badge, Button, PageHeader, Tabs } from '../../components/ui';
import { api } from '../../lib/api';
import { formatTime } from '../../lib/format';
import { useApi, useApiMutation } from '../../lib/hooks';
import { beep, useBranchSocket } from '../../lib/useBranchSocket';

type Status = 'PENDING' | 'PREPARING' | 'READY' | 'DELIVERED' | 'CANCELLED';
interface Ticket {
  id: string;
  status: Status;
  label: string;
  createdAt: string;
  updatedAt: string;
  items: { name: string; quantity: number; modifiers: string[]; components?: string[]; notes?: string | null }[];
}

const COLUMNS: { status: Status; title: string; next?: Status; action?: string; color: string }[] = [
  { status: 'PENDING', title: 'Pendientes', next: 'PREPARING', action: 'Preparar', color: 'bg-amber-500' },
  { status: 'PREPARING', title: 'En preparación', next: 'READY', action: 'Listo', color: 'bg-sky-500' },
  { status: 'READY', title: 'Listos', next: 'DELIVERED', action: 'Entregado', color: 'bg-emerald-500' },
];

function useNow(interval = 30_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(t);
  }, [interval]);
  return now;
}

export function KitchenPage() {
  const { branchId } = useAuth();
  const [sound, setSound] = useState(true);
  const [mobileTab, setMobileTab] = useState<Status>('PENDING');
  const tickets = useApi<Ticket[]>(['kitchen', branchId], '/kitchen/tickets', { refetchInterval: 20_000 });
  const known = useRef<Set<string> | null>(null);
  const connected = useBranchSocket(branchId, [['kitchen', branchId]]);
  const now = useNow();

  // Suena cuando llega una comanda nueva.
  useEffect(() => {
    if (!tickets.data) return;
    const ids = new Set(tickets.data.map((t) => t.id));
    if (known.current && sound && tickets.data.some((t) => t.status === 'PENDING' && !known.current!.has(t.id))) beep();
    known.current = ids;
  }, [tickets.data, sound]);

  const move = useApiMutation((v: { id: string; status: Status }) => api(`/kitchen/tickets/${v.id}`, { method: 'PATCH', json: { status: v.status } }), {
    invalidate: [['kitchen', branchId]],
  });

  const closeMany = useApiMutation((scope: 'previous' | 'all') => api<{ closed: number }>('/kitchen/tickets/close', { method: 'POST', json: { scope } }), {
    invalidate: [['kitchen', branchId]], success: 'Comandas cerradas',
  });

  const byStatus = (s: Status) => (tickets.data ?? []).filter((t) => t.status === s);
  const open = (tickets.data ?? []).filter((t) => t.status !== 'DELIVERED' && t.status !== 'CANCELLED');
  const todayStart = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }) + 'T00:00:00-05:00').getTime();
  const previous = open.filter((t) => new Date(t.createdAt).getTime() < todayStart).length;

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="Cocina"
        subtitle={
          <span className="inline-flex items-center gap-1">
            {connected ? <Wifi className="size-4 text-emerald-600" /> : <WifiOff className="size-4 text-red-600" />}
            {connected ? 'En vivo' : 'Reconectando… (se actualiza cada 20 s)'}
          </span>
        }
        actions={
          <>
            {open.length > 0 && (
              <Button variant="secondary" loading={closeMany.isPending}
                onClick={() => confirm(`¿Cerrar las ${open.length} comandas abiertas? Se marcarán como entregadas.`) && closeMany.mutate('all')}>
                <CheckCheck className="size-4" /> Cerrar todas
              </Button>
            )}
            <Button variant="secondary" onClick={() => setSound(!sound)}>{sound ? <Bell className="size-4" /> : <BellOff className="size-4" />} Sonido</Button>
            <Button variant="secondary" onClick={() => document.documentElement.requestFullscreen?.()}><Maximize className="size-4" /> Pantalla completa</Button>
          </>
        }
      />
      {previous > 0 && (
        <div className="mb-4">
          <Alert tone="info">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>Hay {previous} comanda{previous === 1 ? '' : 's'} de días anteriores sin cerrar.</span>
              <Button variant="secondary" loading={closeMany.isPending} onClick={() => closeMany.mutate('previous')}>Cerrar las de días anteriores</Button>
            </div>
          </Alert>
        </div>
      )}
      <div className="lg:hidden">
        <Tabs value={mobileTab} onChange={setMobileTab} tabs={COLUMNS.map((c) => ({ value: c.status, label: `${c.title} (${byStatus(c.status).length})` }))} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((col) => (
          <section key={col.status} className={clsx('space-y-3', mobileTab !== col.status && 'hidden lg:block')}>
            <h2 className="hidden items-center gap-2 font-semibold lg:flex">
              <span className={clsx('size-3 rounded-full', col.color)} /> {col.title} <Badge>{byStatus(col.status).length}</Badge>
            </h2>
            {byStatus(col.status).map((t) => {
              const minutes = Math.floor((now - new Date(t.createdAt).getTime()) / 60000);
              return (
                <article key={t.id} className={clsx('overflow-hidden rounded-2xl border bg-white shadow-sm', minutes >= 20 && col.status !== 'READY' ? 'border-red-400' : minutes >= 10 && col.status !== 'READY' ? 'border-amber-400' : 'border-slate-200')}>
                  <header className={clsx('flex items-center justify-between px-4 py-2 text-white', col.color)}>
                    <span className="font-bold">{t.label}</span>
                    <span className="text-sm">{formatTime(t.createdAt)} · {minutes} min</span>
                  </header>
                  <ul className="space-y-2 px-4 py-3">
                    {t.items.map((i, idx) => (
                      <li key={idx}>
                        <p className="text-lg leading-tight font-semibold"><span className="mr-1 text-brand-dark">{i.quantity}×</span>{i.name}</p>
                        {i.components && i.components.length > 0 && (
                          <ul className="mt-0.5 text-sm font-medium text-slate-700">{i.components.map((c, k) => <li key={k}>↳ {c}</li>)}</ul>
                        )}
                        {i.modifiers.length > 0 && <p className="text-sm text-slate-600">{i.modifiers.join(', ')}</p>}
                        {i.notes && <p className="text-sm font-semibold text-red-700">⚠ {i.notes}</p>}
                      </li>
                    ))}
                  </ul>
                  <footer className="flex gap-2 border-t border-slate-100 p-3">
                    {col.status === 'PREPARING' && <Button variant="ghost" onClick={() => move.mutate({ id: t.id, status: 'PENDING' })}>Regresar</Button>}
                    {col.status !== 'READY' && (
                      <Button variant="ghost" title="Marcar como entregada sin pasar por los demás estados"
                        onClick={() => confirm(`¿Cerrar la comanda ${t.label}?`) && move.mutate({ id: t.id, status: 'DELIVERED' })}>Cerrar</Button>
                    )}
                    {col.next && <Button className="flex-1" onClick={() => move.mutate({ id: t.id, status: col.next! })}>{col.action}</Button>}
                  </footer>
                </article>
              );
            })}
            {byStatus(col.status).length === 0 && <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">Sin comandas</p>}
          </section>
        ))}
      </div>
    </div>
  );
}
