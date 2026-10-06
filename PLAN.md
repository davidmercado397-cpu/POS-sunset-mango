# Plan — POS Sunset Mango (SaaS para restaurantes)

> Estado: **borrador v2**. Incluye las respuestas de la primera ronda. Quedan abiertas las preguntas de la sección 9.

## 1. Visión general

Aplicación web **SaaS multi-tenant** para restaurantes:

- Un **Super Admin (master)** administra varios **negocios (tenants)**.
- Cada negocio tiene una o más **sedes (puntos de venta)** que **comparten el catálogo** del negocio.
- Cada sede vende en un **POS visual** (productos con foto), con **una sola caja abierta a la vez**, apertura, cierre y **cuadre por método de pago**.
- Responsive (PC, tablet y celular), solo en español, moneda **COP** sin decimales, siempre en línea.
- Desplegada con **Docker** en un **VPS propio** con dominio y HTTPS.

## 2. Stack tecnológico

| Capa | Tecnología | Motivo |
|---|---|---|
| Frontend | **React 18 + Vite + TypeScript** | SPA rápida, fácil de mantener |
| UI | **TailwindCSS + shadcn/ui** | Responsive, temas por variables CSS (colores por negocio) |
| Estado / datos | **TanStack Query** + Zustand (carrito) | Caché y sincronización con la API |
| Backend | **Node.js 20 + NestJS (TypeScript)** | Módulos, guards de roles y permisos, validación |
| ORM | **Prisma** | Migraciones y tipado de punta a punta |
| Base de datos | **PostgreSQL 16** | Transacciones confiables para dinero e inventario |
| Autenticación | JWT de acceso (15 min) + refresh token rotativo en cookie httpOnly; contraseñas con **argon2** | Seguro, sin 2FA |
| Tiempo real | **Socket.IO** | Comandas a cocina en vivo |
| Imágenes | Subida → **sharp** (redimensiona y convierte a WebP) → volumen Docker | Ligeras para tablet y celular |
| Proxy / HTTPS | **Caddy** (certificados Let's Encrypt automáticos) | HTTPS sin configuración manual |
| Despliegue | `Dockerfile` multi-stage (el backend sirve el frontend compilado) + `docker-compose.yml` (app + postgres + caddy) | Un comando para levantar todo |

Estructura del repositorio (monorepo):

```
/apps/api        NestJS + Prisma
/apps/web        React + Vite
/docker          Caddyfile, scripts
Dockerfile
docker-compose.yml
```

## 3. Modelo multi-tenant y seguridad

**Niveles de usuario**

| Nivel | Alcance | Puede |
|---|---|---|
| Super Admin | Plataforma | Crear y suspender negocios, crear su usuario administrador, ver uso general |
| Admin de negocio | Un negocio | Sedes, catálogo, inventario, usuarios, roles, **marca (logo y colores)**, **activar o desactivar módulos** |
| Admin de sede | Una o varias sedes | Abrir y cerrar caja, **anular ventas**, gastos, reportes de la sede |
| Cajero | Una sede | Vender, abrir y cerrar su caja, registrar gastos (si tiene el permiso) |
| Mesero / Cocina | Una sede | Solo si los módulos de mesas o comandas están activos |

- **Permisos granulares** (ej. `caja.abrir`, `caja.cerrar`, `ventas.anular`, `productos.editar`, `inventario.ajustar`, `reportes.ver`) agrupados en roles. Hay roles base y el admin del negocio puede crear roles personalizados.
- Aislamiento: todas las tablas de negocio llevan `tenant_id` y el backend lo filtra siempre desde el token (nunca desde el cliente).
- Bloqueo temporal tras 5 intentos fallidos de login, limitación de peticiones (rate limit), cabeceras seguras (helmet) y CORS restringido.
- **Auditoría**: anulaciones, cambios de precio, ajustes de inventario, apertura y cierre de caja (quién, cuándo, antes y después).

## 4. Módulos activables por negocio (desde Seguridad / Configuración)

| Módulo | Por defecto | Descripción |
|---|---|---|
| Venta directa | Siempre activo | Mostrador: pedir, pagar, listo |
| Mesas y pedidos abiertos | **Apagado** | Plano de mesas, cuenta abierta, agregar ítems y cobrar al final |
| Comandas a cocina | **Apagado** | Pantalla de cocina (KDS) en tablet con estados: pendiente → preparando → listo |
| Propinas | Activo | Propina sugerida (%) editable en el cobro |
| Inventario | Activo | Descuento de stock por venta |

La v1 construye completo **venta directa, propinas, inventario y comandas**. **Mesas** queda con el modelo de datos y la bandera listos; su pantalla se construye en una fase posterior.

## 5. Funcionalidades por módulo

### 5.1 Catálogo (compartido entre sedes del negocio)
- Categorías con orden y color.
- Productos: foto, nombre, descripción, precio base, categoría, activo/inactivo, disponibilidad por sede.
- **Variantes / modificadores**: grupos como "Tamaño" (selección única, obligatorio) o "Adiciones" (múltiple, opcional), y cada opción puede sumar precio.

### 5.2 POS
- Cuadrícula de productos con foto y descripción, filtro por categoría y buscador.
- Selección de variantes en un modal, carrito con cantidades y notas por ítem.
- **Cobro con pago combinado**: Efectivo (calcula el cambio), Transferencia y QR Bold (con número de referencia opcional).
- Propina sugerida editable.
- Solo se puede vender con la caja de la sede abierta.

### 5.3 Caja
- **Apertura**: base inicial en efectivo (con conteo por denominaciones opcional).
- Durante el turno: **gastos y salidas de efectivo** con categoría y descripción, y entradas de efectivo.
- **Cierre (no a ciegas)**: el sistema muestra lo esperado por método y el cajero digita lo contado.
  - Efectivo esperado = base + ventas en efectivo + propinas en efectivo + entradas − gastos − salidas − cambio entregado.
  - Conteo por **denominaciones COP**: billetes de 100.000, 50.000, 20.000, 10.000, 5.000 y 2.000; monedas de 1.000, 500, 200, 100 y 50.
  - Transferencia y QR Bold: esperado vs. confirmado.
  - Diferencia (sobrante o faltante) por método, observaciones y resumen del cierre.
- Una sola caja abierta por sede (se garantiza en la base de datos).

### 5.4 Ventas
- Historial con filtros. **Anulación solo por el admin de sede**, con motivo obligatorio; la anulación revierte el inventario y queda en auditoría.

### 5.5 Inventario
- Stock **por sede**, movimientos (entrada por compra, salida por venta, ajuste, merma) y alertas de stock mínimo.
- *(Ver la pregunta 9.1 sobre productos vs. insumos/recetas.)*

### 5.6 Comandas a cocina
- Al cobrar (o al enviar, si hay mesas), la orden aparece en la pantalla de cocina en tiempo real, con variantes y notas.

### 5.7 Marca por negocio
- Logo, nombre comercial, color primario y secundario; se aplican a toda la interfaz del negocio con variables CSS.

### 5.8 Reportes
- Ventas por día y rango, por método de pago, por producto y categoría, propinas, gastos, historial de cierres con diferencias y valorización de inventario.

## 6. Modelo de datos (resumen)

`Tenant` · `Branch` (sede) · `User` · `Role` · `Permission` · `UserBranch` · `TenantSettings` (módulos, marca)
`Category` · `Product` · `ModifierGroup` · `ModifierOption` · `ProductBranch` (disponibilidad)
`CashSession` (apertura/cierre) · `CashCount` (denominaciones) · `CashMovement` (gastos, entradas y salidas)
`Sale` · `SaleItem` · `SaleItemModifier` · `Payment` (método, monto, referencia) · `Tip`
`StockItem` · `StockMovement` · *(opcional: `Ingredient`, `Recipe`)*
`KitchenOrder` · `Table` *(fase posterior)* · `AuditLog`

Montos en COP como **enteros** (sin decimales).

## 7. Despliegue

- `docker compose up -d` levanta **caddy** (puertos 80/443), **app** (API + frontend) y **postgres** (volumen persistente).
- Volúmenes: `pgdata`, `uploads` (fotos y logos).
- Migraciones automáticas al iniciar y *seed* del Super Admin desde variables de entorno.
- Script de **respaldo diario** de PostgreSQL (`pg_dump`) con retención configurable.

## 8. Fases de desarrollo

| Fase | Entregable |
|---|---|
| 1 | Monorepo, Docker, Postgres, Prisma, auth JWT, seed del Super Admin, layout responsive |
| 2 | Super Admin: negocios. Admin de negocio: sedes, usuarios, roles, permisos, marca, módulos |
| 3 | Catálogo: categorías, productos con foto, variantes y modificadores |
| 4 | Caja: apertura, gastos y movimientos, cierre con denominaciones y cuadre |
| 5 | POS: venta directa, pago combinado, propinas, anulaciones |
| 6 | Inventario: stock por sede, movimientos, alertas |
| 7 | Comandas a cocina (KDS en tiempo real) |
| 8 | Reportes y pulido final |
| 9 | Mesas y pedidos abiertos |

## 9. Preguntas abiertas

1. **Inventario**: ¿se descuenta el **producto terminado** (ej. 1 gaseosa = 1 unidad), o se manejan **insumos con receta** (1 hamburguesa = 1 pan + 150 g de carne + …)? ¿O ambos según el producto?
2. **Inventario**: ¿se registran **compras a proveedores** con costo, para calcular márgenes? ¿Hay **traslados entre sedes**?
3. **Propinas**: ¿cuál es el porcentaje sugerido (10 % es lo común)? En el cierre, ¿la propina se reporta **separada** de la venta (para entregarla al personal)?
4. **Comandas**: ¿pantalla de cocina en tablet (KDS) les sirve, dado que no habrá impresión?
5. **Variantes**: ¿alguna variante **descuenta inventario distinto** (ej. tamaño grande usa más insumo)?
6. **Gastos**: ¿categorías fijas que define el admin (proveedores, servicios, nómina…) o texto libre?
7. **Super Admin**: ¿necesita controlar **planes o suscripciones** de los negocios (activo/suspendido, límite de sedes), o solo crearlos y suspenderlos?
