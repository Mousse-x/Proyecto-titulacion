-- ============================================================
-- Migración: Agregar columnas a evidence.evidences
-- Ejecutar una sola vez en PostgreSQL
-- ============================================================

ALTER TABLE evidence.evidences
  ADD COLUMN IF NOT EXISTS file_path   TEXT,
  ADD COLUMN IF NOT EXISTS source_url  TEXT,
  ADD COLUMN IF NOT EXISTS file_size   BIGINT,
  ADD COLUMN IF NOT EXISTS file_type   VARCHAR(20) DEFAULT 'PDF',
  ADD COLUMN IF NOT EXISTS observations TEXT,
  ADD COLUMN IF NOT EXISTS month        SMALLINT,
  ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ DEFAULT NOW();

-- Asegurar que title puede ser NULL temporalmente (para evidencias auto-extraídas)
-- (ya era VARCHAR(200), solo verificamos que no haya conflictos)

COMMENT ON COLUMN evidence.evidences.file_path   IS 'Ruta relativa en MEDIA_ROOT para archivos subidos';
COMMENT ON COLUMN evidence.evidences.source_url  IS 'URL externa del documento (portales universitarios)';
COMMENT ON COLUMN evidence.evidences.file_size   IS 'Tamaño del archivo en bytes';
COMMENT ON COLUMN evidence.evidences.file_type   IS 'Tipo: PDF, XLSX, DOCX, CSV, URL';
COMMENT ON COLUMN evidence.evidences.observations IS 'Observaciones del auditor al revisar el documento';
COMMENT ON COLUMN evidence.evidences.month        IS 'Mes del documento (1-12), útil para LOTAIP mensual';
COMMENT ON COLUMN evidence.evidences.updated_at  IS 'Última actualización del registro';
