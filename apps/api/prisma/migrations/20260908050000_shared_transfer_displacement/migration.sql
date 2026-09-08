-- 同じ日の Meeting を複数の振替が押し出せるよう、振替単位の一意制約にする。
DROP INDEX "ClassTransferDisplacement_meetingId_date_key";
CREATE UNIQUE INDEX "ClassTransferDisplacement_transferId_meetingId_date_key" ON "ClassTransferDisplacement"("transferId", "meetingId", "date");
