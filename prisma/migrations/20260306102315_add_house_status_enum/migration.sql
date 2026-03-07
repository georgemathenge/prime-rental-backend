/*
  Warnings:

  - The `status` column on the `House` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "HouseStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'MAINTENANCE');

-- AlterTable
ALTER TABLE "House" DROP COLUMN "status",
ADD COLUMN     "status" "HouseStatus" NOT NULL DEFAULT 'AVAILABLE';
