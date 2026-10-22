-- Fecha de cierre del grupo: la reapertura solo vale dentro de la gracia (5 días).
-- AlterTable
ALTER TABLE "Household" ADD COLUMN     "closedAt" TIMESTAMP(3);
