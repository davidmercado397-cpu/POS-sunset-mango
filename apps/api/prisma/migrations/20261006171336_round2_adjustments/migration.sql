-- CreateEnum
CREATE TYPE "OnlinePaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED');

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "transferInfo" TEXT;

-- AlterTable
ALTER TABLE "CashMovement" ADD COLUMN     "method" "PaymentMethod" NOT NULL DEFAULT 'CASH';

-- AlterTable
ALTER TABLE "OnlineOrder" ADD COLUMN     "paymentReference" TEXT,
ADD COLUMN     "paymentStatus" "OnlinePaymentStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "boldEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "boldIdentityKey" TEXT,
ADD COLUMN     "boldSecretKeyEnc" TEXT;
