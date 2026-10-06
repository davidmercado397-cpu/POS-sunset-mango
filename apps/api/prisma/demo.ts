/**
 * Crea un negocio de demostración ("Sunset Mango Demo") con dos sedes, usuarios, catálogo,
 * variantes, insumos con recetas y existencias. Es idempotente: si ya existe, no hace nada.
 *
 *   Desarrollo: npm run demo:dev        Docker: docker compose exec app node dist/prisma/demo.js
 */
import { PrismaClient } from '@prisma/client';
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
        data: { name: 'Sunset Mango Demo', slug: 'sunset-mango-demo', brandName: 'Sunset Mango', enabledModules: modules, primaryColor: '#f97316', secondaryColor: '#9a3412' },
      });
      const roles = Object.fromEntries(
        await Promise.all(
          SYSTEM_ROLES.map(async (r) => [r.name, await tx.role.create({ data: { tenantId: tenant.id, name: r.name, description: r.description, permissions: r.permissions, isSystem: true } })] as const),
        ),
      );
      const centro = await tx.branch.create({ data: { tenantId: tenant.id, name: 'Sede Centro', address: 'Calle 10 # 5-20', activeModules: modules } });
      const norte = await tx.branch.create({ data: { tenantId: tenant.id, name: 'Sede Norte', activeModules: modules.filter((m) => m !== 'tables') } });

      const users = [
        { username: 'demo-admin', fullName: 'Ana Administradora', role: 'Administrador', branches: [centro.id, norte.id] },
        { username: 'demo-sede', fullName: 'Sergio Admin Sede', role: 'Administrador de sede', branches: [centro.id] },
        { username: 'demo-cajero', fullName: 'Camila Cajera', role: 'Cajero', branches: [centro.id] },
        { username: 'demo-cocina', fullName: 'Carlos Cocina', role: 'Cocina', branches: [centro.id] },
      ];
      for (const u of users) {
        await tx.user.create({
          data: { tenantId: tenant.id, username: u.username, fullName: u.fullName, roleId: roles[u.role].id, passwordHash: hash, branches: { create: u.branches.map((branchId) => ({ branchId })) } },
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
        recipe: [string, number][], groups: { name: string; min: number; max: number; options: [string, number, [string, number][]?][] }[] = [], sendToKitchen = true,
      ) => {
        await tx.product.create({
          data: {
            tenantId: tenant.id, name, price, categoryId, description, sendToKitchen,
            recipe: { create: recipe.map(([inventoryItemId, quantity]) => ({ inventoryItemId, quantity })) },
            modifierGroups: {
              create: groups.map((g, gi) => ({
                name: g.name, minSelect: g.min, maxSelect: g.max, sortOrder: gi,
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
      const extras = { name: 'Adiciones', min: 0, max: 3, options: [['Queso extra', 2500, [[queso, 1]]], ['Tocineta', 3500, [[tocineta, 30]]], ['Huevo', 2000]] as [string, number, [string, number][]?][] };
      await product('Hamburguesa Clásica', 18000, burgers, 'Carne 150 g, queso cheddar, lechuga, tomate y salsa de la casa', [[pan, 1], [carne, 150], [queso, 1]], [size, extras]);
      await product('Hamburguesa Sunset', 24000, burgers, 'Carne 150 g, tocineta, cheddar y mermelada de mango', [[pan, 1], [carne, 150], [queso, 1], [tocineta, 30], [mango, 20]], [size, extras]);
      await product('Papas a la francesa', 7000, sides, 'Porción crocante con sal marina', [[papa, 200]], [
        { name: 'Tamaño', min: 1, max: 1, options: [['Personal', 0], ['Grande', 3000, [[papa, 150]]]] },
      ]);
      await product('Gaseosa', 4000, drinks, 'Botella 400 ml', [[gaseosa, 1]], [], false);
      await product('Agua', 3500, drinks, 'Botella 600 ml', [[agua, 1]], [], false);
      await product('Jugo de mango', 6500, drinks, 'Natural, en agua o en leche', [[mango, 150]], [
        { name: 'Preparación', min: 1, max: 1, options: [['En agua', 0], ['En leche', 1000]] },
      ]);
      await product('Cheesecake de mango', 9000, desserts, 'Porción individual', [[mango, 40]]);
    });
    console.log(`[demo] Negocio de demostración creado. Usuarios: demo-admin, demo-sede, demo-cajero, demo-cocina · contraseña: ${PASSWORD}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[demo]', err);
  process.exit(1);
});
