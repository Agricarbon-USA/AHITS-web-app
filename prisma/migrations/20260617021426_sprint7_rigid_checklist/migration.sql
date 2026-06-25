-- AlterTable
ALTER TABLE "check_logs" ADD COLUMN     "rigId" TEXT;

-- CreateIndex
CREATE INDEX "check_logs_rigId_idx" ON "check_logs"("rigId");

-- AddForeignKey
ALTER TABLE "check_logs" ADD CONSTRAINT "check_logs_rigId_fkey" FOREIGN KEY ("rigId") REFERENCES "rigs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
