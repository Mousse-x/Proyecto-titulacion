-- ============================================================
-- Migración: Agregar columnas de procesamiento a evidence.evidences
-- para el módulo de validación automática LOTAIP
-- Ejecutar una sola vez en PostgreSQL
-- ============================================================

ALTER TABLE evidence.evidences
  ADD COLUMN IF NOT EXISTS file_hash          VARCHAR(64),
  ADD COLUMN IF NOT EXISTS metadata_json      JSONB,
  ADD COLUMN IF NOT EXISTS extracted_text     TEXT,
  ADD COLUMN IF NOT EXISTS processing_status  VARCHAR(20) DEFAULT 'pending';

COMMENT ON COLUMN evidence.evidences.file_hash         IS 'Hash SHA256 del archivo para verificar integridad';
COMMENT ON COLUMN evidence.evidences.metadata_json     IS 'Metadatos extraídos del archivo (JSON)';
COMMENT ON COLUMN evidence.evidences.extracted_text    IS 'Texto completo extraído del documento';
COMMENT ON COLUMN evidence.evidences.processing_status IS 'Estado de procesamiento: pending, processed, error';
