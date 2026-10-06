import { useState } from 'react';
import { Button, Table } from '../../components/ui';
import { formatDateTime } from '../../lib/format';
import { useApi } from '../../lib/hooks';

interface AuditPage { total: number; page: number; pages: number; rows: { id: string; action: string; entity: string | null; createdAt: string; userName: string; ip: string | null; data: unknown }[] }

const ACTION_LABELS: Record<string, string> = {
  'auth.login': 'Inicio de sesión',
  'auth.login_failed': 'Intento fallido de ingreso',
  'auth.locked': 'Usuario bloqueado',
  'auth.password_changed': 'Cambio de contraseña',
  'auth.refresh_reuse': 'Sesión revocada por reutilización',
  'user.created': 'Usuario creado',
  'user.updated': 'Usuario editado',
  'user.password_reset': 'Contraseña restablecida',
  'role.created': 'Rol creado',
  'role.updated': 'Rol editado',
  'role.deleted': 'Rol eliminado',
  'branch.created': 'Sede creada',
  'branch.updated': 'Sede editada',
  'settings.branding': 'Marca actualizada',
  'cash.opened': 'Caja abierta',
  'cash.closed': 'Caja cerrada',
  'cash.movement': 'Movimiento de caja',
  'sale.voided': 'Venta anulada',
  'product.price_changed': 'Cambio de precio',
  'inventory.adjusted': 'Ajuste de inventario',
  'inventory.movement_corrected': 'Corrección de movimiento de inventario',
  'inventory.cost_set': 'Costo de inventario corregido',
  'purchase.created': 'Compra registrada',
  'transfer.sent': 'Traslado enviado',
  'transfer.received': 'Traslado recibido',
  'transfer.cancelled': 'Traslado cancelado',
  'online.rejected': 'Pedido en línea rechazado',
  'online.cancelled': 'Pedido en línea cancelado',
  'online.settings': 'Configuración de pedidos en línea',
  'online.subdomain': 'Subdominio de la tienda',
  'online.payment_confirmed': 'Pago de pedido en línea confirmado',
  'settings.bold': 'Configuración de Bold',
  'cash.monthly_closed': 'Cierre mensual',
  'cash.monthly_reopened': 'Mes reabierto',
  'expense.created': 'Gasto administrativo creado',
  'expense.updated': 'Gasto administrativo editado',
  'expense.deleted': 'Gasto administrativo eliminado',
  'order.item_removed': 'Producto quitado de una cuenta',
};

export function AuditTab() {
  const [page, setPage] = useState(1);
  const { data } = useApi<AuditPage>(['admin', 'audit', page], `/admin/audit?page=${page}`);
  return (
    <div className="space-y-3">
      <Table>
        <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Detalle</th></tr></thead>
        <tbody>
          {data?.rows.map((r) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap text-slate-600">{formatDateTime(r.createdAt)}</td>
              <td>{r.userName}</td>
              <td>{ACTION_LABELS[r.action] ?? r.action}</td>
              <td className="max-w-md truncate text-xs text-slate-500" title={r.data ? JSON.stringify(r.data) : ''}>{r.data ? JSON.stringify(r.data) : ''}</td>
            </tr>
          ))}
        </tbody>
      </Table>
      {data && data.pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</Button>
          Página {data.page} de {data.pages}
          <Button variant="secondary" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Siguiente</Button>
        </div>
      )}
    </div>
  );
}
