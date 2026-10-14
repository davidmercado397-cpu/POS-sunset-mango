-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "appSubdomain" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_appSubdomain_key" ON "Tenant"("appSubdomain");

