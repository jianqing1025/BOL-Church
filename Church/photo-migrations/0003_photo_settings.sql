-- Admin-configurable defaults for uploads (compression + default year/album).
-- Single-row table (id = 1). Also created/seeded defensively in
-- ensurePhotoTables(). Defaults: max long edge 1600px, JPEG quality 0.82.

CREATE TABLE IF NOT EXISTS photo_settings (
  id INTEGER PRIMARY KEY,
  max_long_edge INTEGER NOT NULL DEFAULT 1600,
  jpeg_quality REAL NOT NULL DEFAULT 0.82,
  default_year TEXT NOT NULL DEFAULT '',
  default_album TEXT NOT NULL DEFAULT ''
);

INSERT OR IGNORE INTO photo_settings (id, max_long_edge, jpeg_quality) VALUES (1, 1600, 0.82);
