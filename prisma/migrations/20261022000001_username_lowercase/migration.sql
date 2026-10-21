-- Normalización de usuarios a minúsculas (el login ya compara en
-- minúsculas: `LoginSchema` en auth.ts). Solo se tocan filas sin colisión;
-- si quedara alguna con mayúsculas tras esta migración, hay duplicados
-- case-insensitive que requieren resolución manual antes de continuar.
UPDATE "User"
SET username = LOWER(username)
WHERE username <> LOWER(username)
  AND NOT EXISTS (
    SELECT 1 FROM "User" u2 WHERE u2.username = LOWER("User".username)
  );
