-- CreateIndex
CREATE UNIQUE INDEX "Transaction_advanceForTxId_advanceForMonth_type_key" ON "Transaction"("advanceForTxId", "advanceForMonth", "type");
