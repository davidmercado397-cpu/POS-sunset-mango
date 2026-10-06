-- CreateEnum
CREATE TYPE "OnlineOrderStatus" AS ENUM ('NEW', 'ACCEPTED', 'READY', 'DISPATCHED', 'COMPLETED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OnlineOrderType" AS ENUM ('DELIVERY', 'PICKUP');

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "allowDelivery" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "allowPickup" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "deliveryFee" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "minOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "onlineAccepting" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "onlineMessage" TEXT,
ADD COLUMN     "whatsapp" TEXT;

-- AlterTable
ALTER TABLE "KitchenTicket" ADD COLUMN     "onlineOrderId" TEXT,
ALTER COLUMN "saleId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "OnlineOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "OnlineOrderStatus" NOT NULL DEFAULT 'NEW',
    "type" "OnlineOrderType" NOT NULL,
    "customerName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT,
    "addressNotes" TEXT,
    "notes" TEXT,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "payWith" INTEGER,
    "items" JSONB NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "deliveryFee" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "rejectReason" TEXT,
    "saleId" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnlineOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OnlineOrder_code_key" ON "OnlineOrder"("code");

-- CreateIndex
CREATE UNIQUE INDEX "OnlineOrder_saleId_key" ON "OnlineOrder"("saleId");

-- CreateIndex
CREATE INDEX "OnlineOrder_branchId_status_createdAt_idx" ON "OnlineOrder"("branchId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "KitchenTicket" ADD CONSTRAINT "KitchenTicket_onlineOrderId_fkey" FOREIGN KEY ("onlineOrderId") REFERENCES "OnlineOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnlineOrder" ADD CONSTRAINT "OnlineOrder_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
