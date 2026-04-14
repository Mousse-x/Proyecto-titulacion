-- =============================================================
-- Migración: Cifrado de email en core.users
-- Ejecutar en pgAdmin o psql ANTES de reiniciar el servidor
-- =============================================================

-- 1. Ampliar la columna email a TEXT (el texto cifrado es más largo que el original)
ALTER TABLE core.users
    ALTER COLUMN email TYPE TEXT;

-- 2. Agregar columna email_hash para búsquedas determinísticas (HMAC-SHA256 = 64 chars hex)
ALTER TABLE core.users
    ADD COLUMN IF NOT EXISTS email_hash VARCHAR(64);

-- 3. Quitar el índice UNIQUE de email y pasarlo a email_hash
--    (el cifrado Fernet es NO determinístico: mismo email → distinto token cada vez)
ALTER TABLE core.users
    DROP CONSTRAINT IF EXISTS users_email_key;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_hash_idx
    ON core.users (email_hash);

-- 4. Verificar el resultado
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_schema = 'core' AND table_name = 'users'
ORDER BY ordinal_position;
