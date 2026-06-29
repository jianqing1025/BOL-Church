ALTER TABLE photos ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0;

UPDATE photos
SET is_favorite = 1
WHERE COALESCE(is_favorite, 0) = 0
  AND (
    COALESCE(favorite_count, 0) > 0
    OR EXISTS(SELECT 1 FROM photo_favorites WHERE photo_favorites.photo_id = photos.id)
  );
