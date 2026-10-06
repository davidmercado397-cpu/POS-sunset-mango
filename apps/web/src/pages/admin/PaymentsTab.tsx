import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Checkbox, Field, Input } from '../../components/ui';
import { api } from '../../lib/api';
import { useApi, useApiMutation } from '../../lib/hooks';

interface BoldSettings { enabled: boolean; identityKey: string; hasSecretKey: boolean; integrationReady: boolean; active: boolean }

/** Configuración de la pasarela Bold (integración pendiente de activar). */
export function PaymentsTab() {
  const { data } = useApi<BoldSettings>(['admin', 'bold'], '/admin/payments/bold');
  const [enabled, setEnabled] = useState(false);
  const [identityKey, setIdentityKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  useEffect(() => {
    if (data) {
      setEnabled(data.enabled);
      setIdentityKey(data.identityKey);
    }
  }, [data]);
  const save = useApiMutation(() => api('/admin/payments/bold', { method: 'PUT', json: { enabled, identityKey, secretKey: secretKey || undefined } }), {
    invalidate: [['admin', 'bold']],
    success: 'Configuración guardada',
  });
  if (!data) return null;

  return (
    <Card className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-lg font-semibold">Pago en línea con Bold</p>
        {data.active ? <Badge tone="green">Activo</Badge> : <Badge tone="amber">Pendiente</Badge>}
      </div>
      {!data.integrationReady && (
        <Alert tone="info">
          La conexión con la API de Bold está preparada pero pendiente de activar. Puedes guardar tus llaves desde ya; cuando se complete la
          integración, la tienda en línea ofrecerá el pago con Bold. Mientras tanto los clientes pagan por transferencia.
        </Alert>
      )}
      <Checkbox label="Usar Bold en la tienda en línea" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
      <Field label="Llave de identidad (pública)"><Input value={identityKey} autoComplete="off" onChange={(e) => setIdentityKey(e.target.value)} /></Field>
      <Field label={data.hasSecretKey ? 'Llave secreta (guardada; escribe una nueva solo para cambiarla)' : 'Llave secreta'}>
        <Input type="password" value={secretKey} autoComplete="new-password" placeholder={data.hasSecretKey ? '••••••••••••' : ''} onChange={(e) => setSecretKey(e.target.value)} />
      </Field>
      <p className="text-xs text-slate-500">Las llaves se obtienen en el panel de comercios de Bold. La llave secreta se guarda cifrada y nunca se vuelve a mostrar.</p>
      <div className="flex justify-end"><Button loading={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: () => setSecretKey('') })}>Guardar</Button></div>
    </Card>
  );
}
