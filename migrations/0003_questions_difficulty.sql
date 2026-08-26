ALTER TABLE questions
ADD COLUMN difficulty TEXT NOT NULL DEFAULT 'hard'
CHECK (difficulty IN ('easy', 'hard', 'hell'));

CREATE INDEX IF NOT EXISTS questions_enabled_map_difficulty_idx
  ON questions (enabled, map_id, difficulty);
