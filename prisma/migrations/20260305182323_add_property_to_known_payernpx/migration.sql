/*
  Warnings:

  - Added the required column `propertyId` to the `KnownPayer` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "KnownPayer" ADD COLUMN     "propertyId" TEXT NOT NULL;
