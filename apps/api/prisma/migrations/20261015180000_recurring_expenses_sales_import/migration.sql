-- AlterTable
ALTER TABLE "AdminExpense" ADD COLUMN     "recurringId" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "code" TEXT;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "importId" TEXT;

-- CreateTable
CREATE TABLE "RecurringExpense" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "categoryId" TEXT,
    "description" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'TRANSFER',
    "dayOfMonth" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesImport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecurringExpense_tenantId_idx" ON "RecurringExpense"("tenantId");

-- CreateIndex
CREATE INDEX "SalesImport_tenantId_branchId_idx" ON "SalesImport"("tenantId", "branchId");

-- CreateIndex
CREATE INDEX "AdminExpense_recurringId_idx" ON "AdminExpense"("recurringId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_tenantId_code_key" ON "Product"("tenantId", "code");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_importId_fkey" FOREIGN KEY ("importId") REFERENCES "SalesImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminExpense" ADD CONSTRAINT "AdminExpense_recurringId_fkey" FOREIGN KEY ("recurringId") REFERENCES "RecurringExpense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Código inicial para los productos existentes: P001, P002… por negocio, en orden de creación.
UPDATE "Product" p SET "code" = 'P' || lpad(n.rn::text, 3, '0')
FROM (SELECT id, row_number() OVER (PARTITION BY "tenantId" ORDER BY "createdAt", id) AS rn FROM "Product") n
WHERE p.id = n.id AND p."code" IS NULL;
