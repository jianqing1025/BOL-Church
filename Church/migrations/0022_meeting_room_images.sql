-- Refresh the six built-in online fellowship card images.
UPDATE meeting_rooms SET image_url = '/images/meeting-rooms/bible-study.jpg' WHERE id = 'bible-study-1';
UPDATE meeting_rooms SET image_url = '/images/meeting-rooms/prayer.jpg' WHERE id = 'prayer';
UPDATE meeting_rooms SET image_url = '/images/meeting-rooms/coworkers.jpg' WHERE id = 'coworkers';
UPDATE meeting_rooms SET image_url = '/images/meeting-rooms/sisters.jpg' WHERE id = 'bible-study-3';
UPDATE meeting_rooms SET image_url = '/images/meeting-rooms/brothers.jpg' WHERE id = 'bible-study-2';
UPDATE meeting_rooms SET image_url = '/images/meeting-rooms/youth.jpg' WHERE id = 'youth';
