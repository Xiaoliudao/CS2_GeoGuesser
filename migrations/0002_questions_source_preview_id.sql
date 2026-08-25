CREATE UNIQUE INDEX IF NOT EXISTS questions_source_preview_id_unique_idx
  ON questions (source_preview_id)
  WHERE source_preview_id IS NOT NULL;
