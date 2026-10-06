/**
 * Crea un negocio de demostración ("Sunset Mango Demo") con dos sedes, usuarios, catálogo,
 * variantes, insumos con recetas y existencias. Es idempotente: si ya existe, no hace nada.
 *
 *   Desarrollo: npm run demo:dev        Docker: docker compose exec app node dist/prisma/demo.js
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/auth/password';
import { MODULE_CATALOG } from '../src/common/modules';
import { SYSTEM_ROLES } from '../src/common/permissions';

const PASSWORD = process.env.DEMO_PASSWORD ?? 'Demo12345';

async function main() {
  const prisma = new PrismaClient();
  try {
    if (await prisma.tenant.findUnique({ where: { slug: 'sunset-mango-demo' } })) {
      console.log('[demo] El negocio de demostración ya existe');
      return;
    }
    const modules = MODULE_CATALOG.map((m) => m.key);
    const hash = await hashPassword(PASSWORD);

    await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: 'Sunset Mango Demo', slug: 'sunset-mango-demo', storeSubdomain: 'sunsetmango', brandName: 'Sunset Mango', enabledModules: modules, primaryColor: '#f97316', secondaryColor: '#9a3412' },
      });
      const roles = Object.fromEntries(
        await Promise.all(
          SYSTEM_ROLES.map(async (r) => [r.name, await tx.role.create({ data: { tenantId: tenant.id, name: r.name, description: r.description, permissions: r.permissions, isSystem: true } })] as const),
        ),
      );
      const centro = await tx.branch.create({
        data: { tenantId: tenant.id, name: 'Sede Centro', address: 'Calle 10 # 5-20', activeModules: modules, deliveryFee: 4000, minOrder: 15000, whatsapp: '3001234567', onlineMessage: 'Domicilios de 11 a. m. a 9 p. m.', transferInfo: 'Bancolombia ahorros 123-456789-00\nNequi 300 123 4567\nA nombre de Sunset Mango SAS' },
      });
      const norte = await tx.branch.create({ data: { tenantId: tenant.id, name: 'Sede Norte', activeModules: modules.filter((m) => m !== 'tables') } });

      const users = [
        { username: 'admin@sunsetmango.com', fullName: 'Ana Administradora', role: 'Administrador', branches: [centro.id, norte.id] },
        { username: 'sede@sunsetmango.com', fullName: 'Sergio Admin Sede', role: 'Administrador de sede', branches: [centro.id] },
        { username: 'cajero@sunsetmango.com', fullName: 'Camila Cajera', role: 'Cajero', branches: [centro.id] },
        { username: 'mesero@sunsetmango.com', fullName: 'Mateo Mesero', role: 'Mesero', branches: [centro.id] },
        { username: 'cocina@sunsetmango.com', fullName: 'Carlos Cocina', role: 'Cocina', branches: [centro.id] },
      ];
      for (const u of users) {
        await tx.user.create({
          data: { tenantId: tenant.id, username: u.username, email: u.username, fullName: u.fullName, roleId: roles[u.role].id, passwordHash: hash, branches: { create: u.branches.map((branchId) => ({ branchId })) } },
        });
      }
      await tx.expenseCategory.createMany({
        data: ['Proveedores', 'Servicios públicos', 'Nómina', 'Arriendo', 'Transporte', 'Aseo', 'Otros'].map((name) => ({ tenantId: tenant.id, name })),
      });
      for (const [i, name] of ['Mesa 1', 'Mesa 2', 'Mesa 3', 'Mesa 4', 'Barra 1', 'Barra 2'].entries()) {
        await tx.diningTable.create({ data: { tenantId: tenant.id, branchId: centro.id, name, area: name.startsWith('Mesa') ? 'Salón' : 'Barra', sortOrder: i } });
      }

      // Inventario
      const item = async (name: string, unit: string, type: 'INGREDIENT' | 'PRODUCT', minStock: number, qty: number, cost: number) => {
        const it = await tx.inventoryItem.create({ data: { tenantId: tenant.id, name, unit, type, minStock } });
        for (const b of [centro, norte]) {
          await tx.stock.create({ data: { itemId: it.id, branchId: b.id, quantity: qty, avgCost: cost } });
          await tx.stockMovement.create({ data: { tenantId: tenant.id, branchId: b.id, itemId: it.id, type: 'INITIAL', quantity: qty, unitCost: cost, balanceAfter: qty, note: 'Inventario inicial (demo)' } });
        }
        return it.id;
      };
      const pan = await item('Pan brioche', 'und', 'INGREDIENT', 20, 100, 900);
      const carne = await item('Carne de res', 'g', 'INGREDIENT', 3000, 15000, 28);
      const queso = await item('Queso cheddar', 'und', 'INGREDIENT', 20, 150, 450);
      const tocineta = await item('Tocineta', 'g', 'INGREDIENT', 500, 3000, 45);
      const papa = await item('Papa a la francesa', 'g', 'INGREDIENT', 2000, 20000, 9);
      const mango = await item('Pulpa de mango', 'g', 'INGREDIENT', 1000, 8000, 12);
      const gaseosa = await item('Gaseosa 400 ml', 'und', 'PRODUCT', 24, 96, 1800);
      const agua = await item('Agua 600 ml', 'und', 'PRODUCT', 24, 72, 1200);

      const cat = async (name: string, color: string, sortOrder: number) => (await tx.category.create({ data: { tenantId: tenant.id, name, color, sortOrder } })).id;
      const burgers = await cat('Hamburguesas', '#ef4444', 0);
      const sides = await cat('Acompañantes', '#eab308', 1);
      const drinks = await cat('Bebidas', '#3b82f6', 2);
      const desserts = await cat('Postres', '#ec4899', 3);

      const product = async (
        name: string, price: number, categoryId: string, description: string,
        recipe: [string, number][], groups: { name: string; min: number; max: number; repeat?: boolean; options: [string, number, [string, number][]?][] }[] = [], sendToKitchen = true,
      ) => {
        return tx.product.create({
          data: {
            tenantId: tenant.id, name, price, categoryId, description, sendToKitchen,
            recipe: { create: recipe.map(([inventoryItemId, quantity]) => ({ inventoryItemId, quantity })) },
            modifierGroups: {
              create: groups.map((g, gi) => ({
                name: g.name, minSelect: g.min, maxSelect: g.max, allowRepeat: !!g.repeat, sortOrder: gi,
                options: {
                  create: g.options.map(([oname, delta, rec], oi) => ({
                    name: oname, priceDelta: delta, sortOrder: oi,
                    recipe: { create: (rec ?? []).map(([inventoryItemId, quantity]) => ({ inventoryItemId, quantity })) },
                  })),
                },
              })),
            },
          },
        });
      };
      const size = { name: 'Tamaño', min: 1, max: 1, options: [['Sencilla', 0], ['Doble carne', 6000, [[carne, 150]]]] as [string, number, [string, number][]?][] };
      const extras = { name: 'Toppings', min: 0, max: 4, repeat: true, options: [['Queso extra', 2500, [[queso, 1]]], ['Tocineta', 3500, [[tocineta, 30]]], ['Huevo', 2000]] as [string, number, [string, number][]?][] };
      const clasica = await product('Hamburguesa Clásica', 18000, burgers, 'Carne 150 g, queso cheddar, lechuga, tomate y salsa de la casa', [[pan, 1], [carne, 150], [queso, 1]], [size, extras]);
      await product('Hamburguesa Sunset', 24000, burgers, 'Carne 150 g, tocineta, cheddar y mermelada de mango', [[pan, 1], [carne, 150], [queso, 1], [tocineta, 30], [mango, 20]], [size, extras]);
      const papasProduct = await product('Papas a la francesa', 7000, sides, 'Porción crocante con sal marina', [[papa, 200]], [
        { name: 'Tamaño', min: 1, max: 1, options: [['Personal', 0], ['Grande', 3000, [[papa, 150]]]] },
      ]);
      const gaseosaProduct = await product('Gaseosa', 4000, drinks, 'Botella 400 ml', [[gaseosa, 1]], [], false);
      await product('Agua', 3500, drinks, 'Botella 600 ml', [[agua, 1]], [], false);
      await product('Jugo de mango', 6500, drinks, 'Natural, en agua o en leche', [[mango, 150]], [
        { name: 'Preparación', min: 1, max: 1, options: [['En agua', 0], ['En leche', 1000]] },
      ]);
      await product('Cheesecake de mango', 9000, desserts, 'Porción individual', [[mango, 40]]);

      // Combo: hamburguesa + papas + gaseosa con precio especial.
      const combos = await cat('Combos', '#8b5cf6', -1);
      await tx.product.create({
        data: {
          tenantId: tenant.id, name: 'Combo Clásico', price: 25000, categoryId: combos, isCombo: true, sortOrder: 0,
          description: 'Hamburguesa Clásica + papas personales + gaseosa',
          comboItems: { create: [clasica.id, papasProduct.id, gaseosaProduct.id].map((productId, i) => ({ productId, quantity: 1, sortOrder: i })) },
        },
      });

      await generateHistory(tx, tenant.id, centro.id, 7);
      await generateHistory(tx, tenant.id, norte.id, 11, 0.6);
      await generateAdminExpenses(tx, tenant.id, [centro.id, norte.id]);
    }, { timeout: 120_000 });
    console.log(`[demo] Negocio de demostración creado. Usuarios: admin@, sede@, cajero@, mesero@ y cocina@sunsetmango.com · contraseña: ${PASSWORD}`);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Ventas y cierres diarios del mes anterior (Sede Centro) para ver reportes y el cierre mensual.
 * Usa un generador pseudoaleatorio fijo para que los datos sean siempre los mismos.
 */
async function generateHistory(tx: Prisma.TransactionClient, tenantId: string, branchId: string, initialSeed: number, volume = 1) {
  let seed = initialSeed;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length)];
  const products = await tx.product.findMany({ where: { tenantId } });
  const cashier = await tx.user.findFirstOrThrow({ where: { tenantId, username: 'admin@sunsetmango.com' } });
  const categories = await tx.expenseCategory.findMany({ where: { tenantId } });
  const now = new Date(Date.now() - 5 * 3600_000);
  const year = now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  const month = now.getUTCMonth() === 0 ? 12 : now.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let number = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    if (new Date(Date.UTC(year, month - 1, day)).getUTCDay() === 1) continue; // lunes cerrado
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const openedAt = new Date(`${date}T10:30:00-05:00`);
    const closedAt = new Date(`${date}T22:00:00-05:00`);
    const session = await tx.cashSession.create({
      data: { tenantId, branchId, status: 'CLOSED', openedById: cashier.id, closedById: cashier.id, openedAt, closedAt, openingAmount: 100000 },
    });
    const collected = { CASH: 0, TRANSFER: 0, QR_BOLD: 0 };
    const tips = { CASH: 0, TRANSFER: 0, QR_BOLD: 0 };
    let salesTotal = 0;
    const salesCount = Math.max(3, Math.round((8 + Math.floor(rand() * 18)) * volume));
    for (let i = 0; i < salesCount; i++) {
      const lines = Array.from({ length: 1 + Math.floor(rand() * 3) }, () => ({ p: pick(products), q: 1 + Math.floor(rand() * 2) }));
      const subtotal = lines.reduce((sum, l) => sum + l.p.price * l.q, 0);
      const method = pick(['CASH', 'CASH', 'TRANSFER', 'QR_BOLD'] as const);
      const tip = rand() < 0.25 ? Math.round((subtotal * 0.1) / 100) * 100 : 0;
      const at = new Date(openedAt.getTime() + rand() * (closedAt.getTime() - openedAt.getTime()));
      await tx.sale.create({
        data: {
          tenantId, branchId, cashSessionId: session.id, number: ++number, status: 'COMPLETED', subtotal, tipAmount: tip, tipMethod: tip ? method : null,
          createdById: cashier.id, createdAt: at, completedAt: at,
          items: { create: lines.map((l) => ({ productId: l.p.id, productName: l.p.name, unitPrice: l.p.price, quantity: l.q, lineTotal: l.p.price * l.q, createdAt: at })) },
          payments: { create: { method, amount: subtotal + tip, received: method === 'CASH' ? subtotal + tip : null, change: method === 'CASH' ? 0 : null } },
        },
      });
      collected[method] += subtotal + tip;
      tips[method] += tip;
      salesTotal += subtotal;
    }
    const expense = rand() < 0.5 ? 5000 + Math.floor(rand() * 4) * 5000 : 0;
    if (expense) {
      await tx.cashMovement.create({ data: { tenantId, branchId, sessionId: session.id, type: 'EXPENSE', amount: expense, categoryId: pick(categories).id, description: 'Compra menor', createdById: cashier.id, createdAt: closedAt } });
    }
    const expected = { CASH: 100000 + collected.CASH - expense, TRANSFER: collected.TRANSFER, QR_BOLD: collected.QR_BOLD };
    const diff = rand() < 0.2 ? -1000 * (1 + Math.floor(rand() * 5)) : 0;
    const counted = { ...expected, CASH: expected.CASH + diff };
    await tx.cashSession.update({
      where: { id: session.id },
      data: {
        summary: {
          openingAmount: 100000, salesCount, voidedCount: 0, salesTotal, tipsTotal: tips.CASH + tips.TRANSFER + tips.QR_BOLD,
          collected, tips, sales: { CASH: collected.CASH - tips.CASH, TRANSFER: collected.TRANSFER - tips.TRANSFER, QR_BOLD: collected.QR_BOLD - tips.QR_BOLD },
          expenses: expense, expensesTransfer: 0, withdrawals: 0, deposits: 0, expected, counted,
          difference: { CASH: diff, TRANSFER: 0, QR_BOLD: 0 },
        },
      },
    });
  }
  await tx.branch.update({ where: { id: branchId }, data: { saleSeq: number } });
}

/** Gastos administrativos del mes anterior: arriendo y servicios por sede, nómina y contador generales. */
async function generateAdminExpenses(tx: Prisma.TransactionClient, tenantId: string, branchIds: string[]) {
  const now = new Date(Date.now() - 5 * 3600_000);
  const year = now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  const month = now.getUTCMonth() === 0 ? 12 : now.getUTCMonth();
  const day = (d: number) => new Date(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}T12:00:00-05:00`);
  const admin = await tx.user.findFirstOrThrow({ where: { tenantId, username: 'admin@sunsetmango.com' } });
  const cat = async (name: string) => (await tx.expenseCategory.findFirstOrThrow({ where: { tenantId, name } })).id;
  const rows = [
    { branchId: branchIds[0], categoryId: await cat('Arriendo'), description: 'Arriendo local Centro', amount: 3500000, date: day(1) },
    { branchId: branchIds[1], categoryId: await cat('Arriendo'), description: 'Arriendo local Norte', amount: 2200000, date: day(1) },
    { branchId: branchIds[0], categoryId: await cat('Servicios públicos'), description: 'Energía y agua Centro', amount: 680000, date: day(12) },
    { branchId: branchIds[1], categoryId: await cat('Servicios públicos'), description: 'Energía y agua Norte', amount: 410000, date: day(12) },
    { branchId: null, categoryId: await cat('Nómina'), description: 'Nómina quincena 1', amount: 4200000, date: day(15) },
    { branchId: null, categoryId: await cat('Nómina'), description: 'Nómina quincena 2', amount: 4200000, date: day(28) },
    { branchId: null, categoryId: await cat('Otros'), description: 'Honorarios contador', amount: 600000, date: day(25) },
  ];
  await tx.adminExpense.createMany({ data: rows.map((r) => ({ ...r, tenantId, method: 'TRANSFER' as const, createdById: admin.id })) });
}

main().catch((err) => {
  console.error('[demo]', err);
  process.exit(1);
});
