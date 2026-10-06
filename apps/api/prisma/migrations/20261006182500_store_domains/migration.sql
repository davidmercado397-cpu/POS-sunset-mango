-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "storeDomain" TEXT,
ADD COLUMN     "storeSubdomain" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_storeSubdomain_key" ON "Tenant"("storeSubdomain");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_storeDomain_key" ON "Tenant"("storeDomain");


-- Los negocios existentes usan su identificador como subdominio
UPDATE "Tenant" SET "storeSubdomain" = "slug" WHERE "storeSubdomain" IS NULL;
