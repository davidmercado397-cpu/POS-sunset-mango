-- CreateTable
CREATE TABLE "MonthlyClose" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "summary" JSONB NOT NULL,
    "notes" TEXT,
    "closedById" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonthlyClose_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonthlyClose_tenantId_idx" ON "MonthlyClose"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyClose_branchId_year_month_key" ON "MonthlyClose"("branchId", "year", "month");
