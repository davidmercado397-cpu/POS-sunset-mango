# Pendientes

## 1. Puesta en producción (VPS)
- [ ] **DNS**: registro A para la app (ej. `pos.tudominio.com`) y registro comodín `*.pedidos.tudominio.com` hacia la IP del VPS.
- [ ] **Certificados HTTPS**: uno para la app y uno **comodín** para las tiendas. El comodín requiere validación por DNS: con certbot es `--preferred-challenges dns`, o el plugin DNS de tu proveedor para renovarlo solo.
- [ ] **Nginx**: copiar y adaptar `docker/nginx.example.conf` (app, subdominios de tiendas y dominios propios, si los hay).
- [ ] **`.env` de producción**: `POSTGRES_PASSWORD`, `JWT_ACCESS_SECRET` (`openssl rand -base64 48`), `SUPERADMIN_PASSWORD`, `PUBLIC_STORE_DOMAIN`, `PUBLIC_APP_URL`, `COOKIE_SECURE=true` y, opcional, `ENCRYPTION_KEY`.
- [ ] **Primer build en el VPS**: confirmar que compila la línea del `Dockerfile` que instala `openssl` (en el entorno de desarrollo no se pudo probar por restricción de red).
- [ ] **Respaldos**: programar `docker/backup.sh` en el crontab y copiar los respaldos fuera del VPS (otro servidor o almacenamiento en la nube).
- [ ] **Monitoreo**: alerta si `/api/health` deja de responder (por ejemplo UptimeRobot) y rotación de logs de Docker.
- [ ] **Dominios propios** de negocios (opcional): por cada uno, registro DNS, certificado y bloque en Nginx.

## 2. Integraciones
- [ ] **Bold (pago en línea)**: implementar `createPaymentLink` y el webhook de confirmación en `apps/api/src/payments/bold.service.ts`, y activar `INTEGRATION_READY`. Se necesita la cuenta de comercio, las llaves y la documentación de Bold. Las llaves ya se pueden guardar en Administración → Pagos en línea.
- [ ] **Correo (SMTP)**: hoy la contraseña solo la restablece un administrador. Con un servicio de correo se puede agregar "olvidé mi contraseña".
- [ ] **WhatsApp automático** (opcional): avisar al cliente cuando su pedido cambia de estado. Hoy lo ve en la página de seguimiento.

## 3. Fuera del alcance actual (posibles fases siguientes)
- [ ] Facturación electrónica DIAN.
- [ ] Impuestos (IVA / impuesto al consumo) en precios y reportes.
- [ ] Impresión de tiquetes y comandas en impresora térmica.
- [ ] Mesas: dividir la cuenta, unir o mover mesas.
- [ ] Domicilios: tarifas por zona o barrio (hoy hay un valor fijo por sede).
- [ ] Inventario: conversión de unidades entre compra y receta (ej. comprar en kg y usar en g). Hoy cada ítem maneja una sola unidad.
- [ ] Márgenes por producto incluyendo el costo de las variantes (hoy usa la receta base).

## 4. Antes de salir a producción (recomendado)
- [ ] Prueba piloto en un negocio real con datos reales durante algunos días.
- [ ] Revisión de seguridad y prueba de carga básica.
- [ ] Capacitación: cajeros (caja y POS), cocina (pantalla de comandas) y administrador (cierres, inventario, gastos).
