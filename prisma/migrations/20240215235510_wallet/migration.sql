/*
  Warnings:

  - Added the required column `walletAddr` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `User` ADD COLUMN `walletAddr` VARCHAR(191) NOT NULL;
