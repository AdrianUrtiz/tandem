-- Unicidad case-insensitive a nivel DB (el login normaliza en la app).
CREATE EXTENSION IF NOT EXISTS citext;
ALTER TABLE "User" ALTER COLUMN username TYPE CITEXT;
