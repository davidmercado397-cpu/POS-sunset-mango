# Sunset Mango POS

POS web multi-negocio (SaaS) para restaurantes: caja diaria con cuadre por método de pago, productos con foto, inventario con recetas, comandas a cocina y módulos que se activan por negocio y por sede.

El plan completo está en [`PLAN.md`](./PLAN.md).

## Estado

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Base del proyecto, Docker, base de datos, autenticación, Super Admin | ✅ |
| 2 | Negocios, Seguridad (módulos), sedes, usuarios, roles, marca | ⏳ |
| 3–9 | Catálogo, caja, POS, inventario, cocina, reportes, mesas | Pendiente |

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

## Desarrollo local

Requisitos: Node 22 y PostgreSQL 16.

```bash
npm install
cp apps/api/.env.example apps/api/.env      # ajusta DATABASE_URL
cd apps/api && npx prisma migrate dev && npm run seed:dev && cd ../..
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
- Límite de peticiones (rate limit), cabeceras seguras (Helmet/CSP), validación estricta de datos de entrada y auditoría de inicios de sesión.
