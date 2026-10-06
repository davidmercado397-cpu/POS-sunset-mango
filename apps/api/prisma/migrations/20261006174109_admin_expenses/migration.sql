-- CreateTable
CREATE TABLE "AdminExpense" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "categoryId" TEXT,
    "description" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'TRANSFER',
    "date" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "receiptUrl" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminExpense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminExpense_tenantId_date_idx" ON "AdminExpense"("tenantId", "date");

-- AddForeignKey
ALTER TABLE "AdminExpense" ADD CONSTRAINT "AdminExpense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
