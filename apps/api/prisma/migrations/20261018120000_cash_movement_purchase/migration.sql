-- AlterTable
ALTER TABLE "CashMovement" ADD COLUMN     "purchaseId" TEXT;

-- CreateIndex
CREATE INDEX "CashMovement_purchaseId_idx" ON "CashMovement"("purchaseId");


-- Vincula las compras ya pagadas con efectivo a su gasto de caja (mismo valor, sede y momento de registro).
UPDATE "CashMovement" m SET "purchaseId" = p.id
FROM "Purchase" p
WHERE p."paidFromCash" AND m."purchaseId" IS NULL AND m."type" = 'EXPENSE'
  AND m."branchId" = p."branchId" AND m."amount" = p."total" AND m."description" LIKE 'Compra%'
  AND abs(extract(epoch FROM (m."createdAt" - p."createdAt"))) < 60;
