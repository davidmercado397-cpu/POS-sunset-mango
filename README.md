# Sunset Mango POS

POS web multi-negocio (SaaS) para restaurantes: caja diaria con cuadre por método de pago, productos con foto, inventario con recetas, comandas a cocina y módulos que se activan por negocio y por sede.

El plan completo está en [`PLAN.md`](./PLAN.md).

## Estado

Todas las fases del plan están construidas y probadas:

| Módulo | Qué incluye |
|---|---|
| Plataforma (Super Admin) | Crear y suspender negocios, pestaña **Seguridad** con los módulos disponibles por negocio, restablecer contraseñas |
| Administración del negocio | Sedes con módulos por sede, usuarios, roles y permisos, marca (logo y colores), categorías de gastos, mesas y auditoría |
| Catálogo | Categorías, productos con foto, variantes y adiciones con precio, disponibilidad por sede y receta |
| POS | Venta por foto, variantes, pago combinado (efectivo, transferencia y QR Bold), propina opcional, cálculo del cambio |
| Caja | Apertura con billetes y monedas, gastos (en efectivo o por transferencia), salidas y entradas, cuadre diario por método de pago con diferencias y **cierre mensual** consolidado |
| Ventas | Historial y anulación (devuelve el inventario; solo con la caja abierta) |
| Inventario | Insumos y productos terminados, existencias por sede, costo promedio, conteo físico, mermas y kardex |
| Compras y traslados | Compras con costo (opcionalmente pagadas con la caja), proveedores y traslados entre sedes |
| Cocina | Pantalla de comandas en tiempo real con sonido y tiempos |
| Mesas | Cuentas abiertas por mesa o por cliente; se agrega, se cobra o se anula |
| Pedidos en línea | Enlace público **sin usuario** para domicilios y pedidos para recoger, con código QR. El cliente paga por transferencia y sigue su pedido. El personal acepta cada pedido y entonces la comanda pasa a cocina. Bold queda listo para configurar |
| Reportes | Ventas por día, hora, método, producto, categoría, vendedor y sede; gastos, utilidad bruta, márgenes por producto y exportación CSV |

## Stack

- **API**: NestJS 11 + Prisma 6 + PostgreSQL 16 (`apps/api`)
- **Web**: React 19 + Vite + TailwindCSS 4 + TanStack Query (`apps/web`)
- **Despliegue**: un `Dockerfile` (la API sirve también el frontend) + `docker-compose.yml` con PostgreSQL

## Desplegar en el VPS

1. Copia el repositorio al servidor y crea el archivo de entorno:
   ```bash
   cp .env.example .env
   # Edita .env: POSTGRES_PASSWORD, JWT_ACCESS_SECRET (openssl rand -base64 48) y SUPERADMIN_PASSWORD
   ```
2. Construye y levanta:
   ```bash
   docker compose up -d --build
   ```
   Al iniciar, el contenedor aplica las migraciones y crea el Super Admin.
3. Configura el servidor web del VPS como proxy inverso hacia `127.0.0.1:3000` con HTTPS.
   Hay un ejemplo de Nginx (incluye WebSocket para la pantalla de cocina) en [`docker/nginx.example.conf`](./docker/nginx.example.conf).
4. Respaldos diarios: programa [`docker/backup.sh`](./docker/backup.sh) en el crontab del VPS.

### Datos de demostración

Para probar todo de inmediato, carga un negocio de ejemplo con dos sedes, catálogo, recetas e inventario:

```bash
docker compose exec app node dist/prisma/demo.js
```

| Correo de ingreso | Rol |
|---|---|
| `admin@sunsetmango.com` | Administrador del negocio |
| `sede@sunsetmango.com` | Administrador de sede |
| `cajero@sunsetmango.com` | Cajero |
| `mesero@sunsetmango.com` | Mesero |
| `cocina@sunsetmango.com` | Cocina |

La contraseña de todos es `Demo12345`. La demo trae las ventas y los cierres diarios del mes anterior para probar los reportes y el cierre mensual. Para ver la tienda pública abre `/pedir/sunset-mango-demo`; para recibir pedidos, la caja de la sede debe estar abierta.

**¿Olvidaste la contraseña del Super Admin?** Cambia `SUPERADMIN_PASSWORD` en `.env` y ejecuta `docker compose up -d`. El contenedor se reinicia y actualiza la clave.

### Variables de entorno principales

| Variable | Descripción |
|---|---|
| `POSTGRES_PASSWORD` | Clave de la base de datos (obligatoria) |
| `JWT_ACCESS_SECRET` | Secreto para firmar los tokens (mínimo 32 caracteres) |
| `SUPERADMIN_USERNAME` / `SUPERADMIN_PASSWORD` | Credenciales del usuario master |
| `APP_PORT` | Puerto local donde escucha la app (por defecto 3000) |
| `COOKIE_SECURE` | `true` cuando se sirve por HTTPS (producción) |
| `TRUST_PROXY` | Número de proxies delante de la app (1 = el servidor web del VPS) |
| `MAX_LOGIN_ATTEMPTS` / `LOCK_MINUTES` | Bloqueo tras intentos fallidos (5 intentos / 15 min) |
| `ENCRYPTION_KEY` | (Opcional) Clave para cifrar llaves de terceros como Bold. Si no se define se usa `JWT_ACCESS_SECRET`; si la cambias, las llaves deben ingresarse de nuevo |

## Desarrollo local

Requisitos: Node 22 y PostgreSQL 16.

```bash
npm install
cp apps/api/.env.example apps/api/.env      # ajusta DATABASE_URL
cd apps/api && npx prisma migrate dev && npm run seed:dev && npm run demo:dev && cd ../..
npm run dev:api     # http://localhost:3000/api
npm run dev:web     # http://localhost:5173 (redirige /api a la API)
```

Pruebas de la API (usan una base de datos `pos_test`):

```bash
cd apps/api
DATABASE_URL=postgresql://postgres@localhost:5432/pos_test npx prisma migrate deploy
npm test
```

## Seguridad implementada

- Contraseñas con **argon2id**; bloqueo temporal tras 5 intentos fallidos.
- Token de acceso de 15 min, solo en memoria del navegador. El **refresh token es rotativo** y viaja en una cookie `httpOnly` + `SameSite=Strict`; si alguien reutiliza un token viejo, se cierra toda la sesión.
- El usuario, su rol y el estado del negocio se verifican en **cada petición**: suspender un negocio o desactivar un usuario corta el acceso de inmediato.
- Límite de peticiones (rate limit), cabeceras seguras (Helmet/CSP), validación estricta de datos de entrada y auditoría.
- Aislamiento entre negocios: cada consulta filtra por el negocio del usuario y la sede se valida en cada petición (encabezado `X-Branch-Id`).
- Los precios siempre se calculan en el servidor, nunca se confía en lo que envía el navegador.
- La tienda pública solo expone el menú. Tiene límite de pedidos por minuto, un campo trampa contra bots y un máximo de 3 pedidos activos por teléfono. El seguimiento no muestra ni el teléfono ni la dirección.
