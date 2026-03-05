/*
  Warnings:

  - A unique constraint covering the columns `[phone,tenantId]` on the table `KnownPayer` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "KnownPayer_phone_tenantId_key" ON "KnownPayer"("phone", "tenantId");
