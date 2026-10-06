/**
 * Crea (o actualiza la contraseña de) el Super Admin a partir de variables de entorno.
 * Es idempotente: se ejecuta en cada arranque del contenedor.
 */
import { PrismaClient } from '@prisma/client';
import { hashPassword, verifyPassword } from '../src/auth/password';

async function main() {
  const prisma = new PrismaClient();
  const username = (process.env.SUPERADMIN_USERNAME ?? 'superadmin').trim().toLowerCase();
  const password = process.env.SUPERADMIN_PASSWORD;
  const fullName = process.env.SUPERADMIN_NAME ?? 'Super Administrador';

  try {
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      if (!existing.isSuperAdmin) {
        throw new Error(`El usuario "${username}" ya existe y no es Super Admin`);
      }
      // Permite recuperar el acceso cambiando SUPERADMIN_PASSWORD y reiniciando.
      if (password && !(await verifyPassword(existing.passwordHash, password))) {
        await prisma.user.update({
          where: { id: existing.id },
          data: { passwordHash: await hashPassword(password), failedLoginAttempts: 0, lockedUntil: null },
        });
        console.log(`[seed] Contraseña del Super Admin "${username}" actualizada`);
      } else {
        console.log(`[seed] Super Admin "${username}" ya existe`);
      }
      return;
    }

    if (!password || password.length < 8) {
      throw new Error('Define SUPERADMIN_PASSWORD (mínimo 8 caracteres) para crear el Super Admin');
    }
    await prisma.user.create({
      data: { username, fullName, isSuperAdmin: true, passwordHash: await hashPassword(password) },
    });
    console.log(`[seed] Super Admin "${username}" creado`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[seed]', err instanceof Error ? err.message : err);
  process.exit(1);
});
