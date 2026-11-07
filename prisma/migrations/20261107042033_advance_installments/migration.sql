-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "advanceForMonth" TEXT,
ADD COLUMN     "advanceForTxId" TEXT;

-- CreateIndex
CREATE INDEX "Transaction_advanceForTxId_advanceForMonth_idx" ON "Transaction"("advanceForTxId", "advanceForMonth");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_advanceForTxId_fkey" FOREIGN KEY ("advanceForTxId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
