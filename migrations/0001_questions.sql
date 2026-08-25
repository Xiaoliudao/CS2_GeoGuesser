CREATE TABLE questions (
  id TEXT PRIMARY KEY,
  image_asset_key TEXT NOT NULL,
  map_id TEXT NOT NULL,
  layer_id TEXT NOT NULL,
  correct_x REAL NOT NULL CHECK (correct_x >= 0 AND correct_x <= 1),
  correct_y REAL NOT NULL CHECK (correct_y >= 0 AND correct_y <= 1),
  world_x REAL,
  world_y REAL,
  world_z REAL,
  view_pitch REAL,
  view_yaw REAL,
  view_roll REAL,
  automatic_x REAL CHECK (automatic_x IS NULL OR (automatic_x >= 0 AND automatic_x <= 1)),
  automatic_y REAL CHECK (automatic_y IS NULL OR (automatic_y >= 0 AND automatic_y <= 1)),
  coordinate_source TEXT NOT NULL CHECK (coordinate_source IN ('world-conversion', 'manual-override')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  content_hash TEXT,
  source_preview_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE question_catalog_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL CHECK (version >= 1),
  updated_at TEXT NOT NULL
) STRICT;

INSERT INTO question_catalog_meta (id, version, updated_at)
VALUES (1, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

CREATE INDEX questions_enabled_idx ON questions (enabled);
CREATE INDEX questions_map_enabled_idx ON questions (map_id, enabled);
CREATE UNIQUE INDEX questions_content_hash_unique_idx
  ON questions (content_hash)
  WHERE content_hash IS NOT NULL;
