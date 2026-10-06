# Plan — POS Sunset Mango (SaaS para restaurantes)

> Estado: **v3 — aprobado**. Incluye las respuestas de las tres rondas de preguntas. Fase 1 completada.

## 1. Visión general

Aplicación web **SaaS multi-tenant** para restaurantes:

- Un **Super Admin (master)** administra varios **negocios (tenants)**.
- Cada negocio tiene una o más **sedes (puntos de venta)** que **comparten el catálogo** del negocio.
- Cada sede vende en un **POS visual** (productos con foto), con **una sola caja abierta a la vez**, apertura, cierre y **cuadre por método de pago**.
- Responsive (PC, tablet y celular), solo en español, moneda **COP** sin decimales, siempre en línea.
- Desplegada con **Docker** en un **VPS propio**. El HTTPS y el dominio los maneja el **servidor web del VPS** (Nginx/Apache como proxy inverso), no la aplicación.

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
| Despliegue | `Dockerfile` multi-stage (el backend sirve el frontend compilado) + `docker-compose.yml` (app + postgres) | Un comando para levantar todo; el servidor web del VPS hace de proxy inverso con HTTPS |

Estructura del repositorio (monorepo):

```
/apps/api        NestJS + Prisma
/apps/web        React + Vite
/docker          scripts (respaldo, entrypoint) y ejemplo de configuración Nginx
Dockerfile
docker-compose.yml
```

## 3. Modelo multi-tenant y seguridad

**Niveles de usuario**

| Nivel | Alcance | Puede |
|---|---|---|
| Super Admin | Plataforma | Crear y suspender negocios, crear su usuario administrador, **pestaña Seguridad: definir qué módulos tiene disponibles cada negocio** |
| Admin de negocio | Un negocio | Sedes, catálogo, inventario, compras, usuarios, roles, **marca (logo y colores)**, **activar o desactivar por sede los módulos que el Super Admin le habilitó** |
| Admin de sede | Una o varias sedes | Abrir y cerrar caja, **anular ventas**, gastos, reportes de la sede |
| Cajero | Una sede | Vender, abrir y cerrar su caja, registrar gastos (si tiene el permiso) |
| Mesero / Cocina | Una sede | Solo si los módulos de mesas o comandas están activos |

- **Permisos granulares** (ej. `caja.abrir`, `caja.cerrar`, `ventas.anular`, `productos.editar`, `inventario.ajustar`, `reportes.ver`) agrupados en roles. Hay roles base y el admin del negocio puede crear roles personalizados.
- Aislamiento: todas las tablas de negocio llevan `tenant_id` y el backend lo filtra siempre desde el token (nunca desde el cliente).
- Bloqueo temporal tras 5 intentos fallidos de login, limitación de peticiones (rate limit), cabeceras seguras (helmet) y CORS restringido.
- **Auditoría**: anulaciones, cambios de precio, ajustes de inventario, apertura y cierre de caja (quién, cuándo, antes y después).

## 4. Módulos activables (dos niveles de Seguridad)

1. **Super Admin → Negocio**: en la pestaña *Seguridad* de cada negocio decide qué módulos están **disponibles** (no todos los negocios necesitan todo el aplicativo).
2. **Admin de negocio → Sede**: dentro de lo disponible, **activa o desactiva** cada módulo por sede.

Un módulo solo funciona si está disponible para el negocio **y** activo en la sede. El backend lo valida en cada petición (no solo se oculta en la interfaz).

| Módulo | Descripción |
|---|---|
| Venta directa (POS) | Siempre disponible: pedir, pagar, listo |
| Caja | Siempre disponible: apertura, gastos, cierre y cuadre |
| Propinas | Campo opcional en el cobro para registrar la propina **si se recibe** (no se sugiere ningún valor) |
| Inventario | Stock por sede, recetas, mermas y ajustes |
| Compras y proveedores | Compras con costo, proveedores, costo promedio |
| Traslados entre sedes | Envío y recepción de inventario entre sedes del mismo negocio |
| Comandas a cocina | Pantalla de cocina (KDS) en tablet, en tiempo real |
| Mesas y pedidos abiertos | Plano de mesas y cuentas abiertas (fase posterior; el modelo y la bandera quedan listos desde ya) |
| Reportes | Reportes de ventas, caja, inventario |

## 5. Funcionalidades por módulo

### 5.1 Catálogo (compartido entre sedes del negocio)
- Categorías con orden y color.
- Productos: foto, nombre, descripción, precio base, categoría, activo/inactivo, disponibilidad por sede.
- **Variantes / modificadores**: grupos como "Tamaño" (selección única, obligatorio) o "Adiciones" (múltiple, opcional), y cada opción puede sumar precio.

### 5.2 POS
- Cuadrícula de productos con foto y descripción, filtro por categoría y buscador.
- Selección de variantes en un modal, carrito con cantidades y notas por ítem.
- **Cobro con pago combinado**: Efectivo (calcula el cambio), Transferencia y QR Bold (con número de referencia opcional).
- Propina **opcional**: campo para registrarla solo si el cliente la deja (sin valor sugerido), con su método de pago.
- Solo se puede vender con la caja de la sede abierta.

### 5.3 Caja
- **Apertura**: base inicial en efectivo (con conteo por denominaciones opcional).
- Durante el turno: **gastos y salidas de efectivo** y entradas de efectivo. Los gastos usan **categorías fijas definidas por el admin** y además permiten **texto libre** (descripción).
- **Cierre (no a ciegas)**: el sistema muestra lo esperado por método y el cajero digita lo contado.
  - Efectivo esperado = base + ventas en efectivo + propinas en efectivo + entradas − gastos − salidas (el cambio entregado ya se descuenta de cada venta).
  - Las **propinas se muestran separadas** de las ventas en el cierre, para poder entregarlas al personal.
  - Conteo por **denominaciones COP**: billetes de 100.000, 50.000, 20.000, 10.000, 5.000 y 2.000; monedas de 1.000, 500, 200, 100 y 50.
  - Transferencia y QR Bold: esperado vs. confirmado.
  - Diferencia (sobrante o faltante) por método, observaciones y resumen del cierre.
- Una sola caja abierta por sede (se garantiza en la base de datos).

### 5.4 Ventas
- Historial con filtros. **Anulación solo por el admin de sede**, con motivo obligatorio; la anulación revierte el inventario y queda en auditoría.

### 5.5 Inventario, recetas, compras y traslados
- **Ítems de inventario** de dos tipos: **insumos** (carne, pan, queso… con unidad: g, ml, unidad) y **productos terminados/reventa** (gaseosa, agua).
- **Receta por producto**: lista de componentes que puede mezclar insumos y productos terminados con su cantidad. Un producto sin receta no descuenta inventario.
- **Las variantes y adiciones también tienen receta** (ej. "Grande" suma 50 g de carne, "Extra queso" suma 1 lonja).
- Al vender se descuenta la receta del producto + la de las opciones elegidas; al anular se revierte.
- Stock **por sede**, con alerta de stock mínimo.
- **Compras a proveedores**: proveedor, sede, ítems, cantidad y costo unitario → aumenta stock y actualiza el **costo promedio ponderado** (permite calcular costo y margen por producto).
- **Traslados entre sedes**: la sede origen envía (sale de su stock) y la sede destino recibe (entra a su stock), con estados enviado → recibido.
- **Ajustes y mermas** con motivo, todo queda en el kardex (historial de movimientos) y en auditoría.
- Se permite vender con stock en cero o negativo (para no frenar la operación), pero queda la alerta.

### 5.6 Comandas a cocina
- Al cobrar (o al enviar, si hay mesas), la orden aparece en la pantalla de cocina en tiempo real, con variantes y notas.

### 5.7 Marca por negocio
- Logo, nombre comercial, color primario y secundario; se aplican a toda la interfaz del negocio con variables CSS.

### 5.8 Reportes
- Ventas por día y rango, por método de pago, por producto y categoría, propinas, gastos, historial de cierres con diferencias y valorización de inventario.

## 6. Modelo de datos (resumen)

`Tenant` (incluye marca y módulos disponibles) · `Branch` (sede, módulos activos) · `User` · `Role` · `Permission` · `UserBranch`
`Category` · `Product` · `ModifierGroup` · `ModifierOption` · `ProductBranch` (disponibilidad)
`CashSession` (apertura/cierre) · `CashCount` (denominaciones) · `CashMovement` (gastos, entradas y salidas)
`Sale` · `SaleItem` · `SaleItemModifier` · `Payment` (método, monto, referencia) · `Tip`
`InventoryItem` (insumo o producto terminado) · `Stock` (por sede) · `StockMovement` (kardex) · `RecipeLine` (de producto o de opción de variante)
`Supplier` · `Purchase` · `PurchaseItem` · `Transfer` · `TransferItem` · `ExpenseCategory`
`KitchenOrder` · `Table` *(fase posterior)* · `AuditLog`

Montos en COP como **enteros** (sin decimales).

## 7. Despliegue

- `docker compose up -d` levanta **app** (API + frontend, puerto interno 3000) y **postgres** (volumen persistente).
- El servidor web del VPS (Nginx/Apache) hace de proxy inverso hacia `127.0.0.1:3000` con HTTPS y soporte de WebSocket (para la pantalla de cocina). Se incluye un ejemplo de configuración Nginx.
- Volúmenes: `pgdata`, `uploads` (fotos y logos).
- Migraciones automáticas al iniciar y *seed* del Super Admin desde variables de entorno.
- Script de **respaldo diario** de PostgreSQL (`pg_dump`) con retención configurable.

## 8. Fases de desarrollo

| Fase | Entregable |
|---|---|
| 1 | Monorepo, Docker, Postgres, Prisma, auth JWT, seed del Super Admin, layout responsive |
| 2 | Super Admin: negocios y Seguridad (módulos disponibles). Admin de negocio: sedes, usuarios, roles, permisos, marca, módulos por sede |
| 3 | Catálogo: categorías, productos con foto, variantes y modificadores |
| 4 | Caja: apertura, gastos y movimientos, cierre con denominaciones y cuadre |
| 5 | POS: venta directa, variantes, pago combinado, propina opcional, anulaciones |
| 6 | Inventario: insumos, recetas (productos y variantes), compras, proveedores, traslados, ajustes, kardex |
| 7 | Comandas a cocina (KDS en tiempo real) |
| 8 | Reportes y pulido final |
| 9 | Mesas y pedidos abiertos |

## 9. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Tenencia | SaaS multi-negocio; las sedes de un negocio comparten catálogo |
| Caja | Una sola caja abierta por sede; cierre no a ciegas, con denominaciones |
| Mesas / comandas | Activables desde Seguridad; comandas en pantalla de cocina (tablet) |
| Pagos | Efectivo, transferencia, QR Bold; pago combinado; referencia opcional; sin integración con Bold |
| Propinas | Sin sugerencia; se registran solo si se reciben; separadas en el cierre |
| Anulaciones | Solo el admin de sede, con motivo |
| Impuestos / DIAN / impresión | No por ahora |
| Inventario | Insumos y productos terminados, recetas en productos y variantes, compras con costo, traslados |
| Gastos | Categorías fijas del admin + texto libre |
| Super Admin | Crear/suspender negocios + Seguridad (módulos disponibles por negocio) |
| HTTPS | Lo maneja el servidor web del VPS |
| Conectividad / idioma | Siempre en línea; español; COP sin decimales |
