-- AlterEnum
ALTER TYPE "MatchStatus" ADD VALUE 'OVER_PAYMENT';

-- AlterTable
ALTER TABLE "BankTransaction" ADD COLUMN     "matchNote" TEXT,
ADD COLUMN     "tenantId" TEXT;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
