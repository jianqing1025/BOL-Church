-- Adds EXIF metadata, thumbnail, and (already-present) uploader columns.
-- Client now resizes + extracts EXIF + generates a thumbnail before upload;
-- the Worker just stores the values. Idempotent ALTERs (D1 has no IF NOT EXISTS
-- for columns, so these are also applied defensively in ensurePhotoTables()).

ALTER TABLE photos ADD COLUMN shot_at TEXT;
ALTER TABLE photos ADD COLUMN camera TEXT;
ALTER TABLE photos ADD COLUMN lens TEXT;
ALTER TABLE photos ADD COLUMN focal_length TEXT;
ALTER TABLE photos ADD COLUMN aperture TEXT;
ALTER TABLE photos ADD COLUMN shutter TEXT;
ALTER TABLE photos ADD COLUMN iso INTEGER;
ALTER TABLE photos ADD COLUMN thumb_object_key TEXT;
ALTER TABLE photos ADD COLUMN thumb_src TEXT;
