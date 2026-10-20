-- Los conteos de lugares se calculan sobre movimientos (filtro de
-- Actividad), no se almacenan: un contador se desincroniza (offline,
-- ediciones, borrados, renombres). Se elimina la columna.

-- AlterTable
ALTER TABLE "Place" DROP COLUMN "useCount";
