-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "discount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "discountNote" TEXT;


-- Los roles base que cobran reciben el nuevo permiso de descuentos.
UPDATE "Role" SET "permissions" = array_append("permissions", 'pos.discount')
WHERE "isSystem" AND "name" IN ('Cajero', 'Administrador de sede') AND NOT ('pos.discount' = ANY("permissions"));
