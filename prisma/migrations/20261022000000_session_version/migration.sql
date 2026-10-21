-- Revocación de sesiones: al cambiar la contraseña se incrementa
-- "sessionVersion" e invalida los JWT emitidos con una versión anterior.
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
