UPDATE members
SET email = 'BOLCCOP@Gmail.com',
    updated_at = '2026-05-12T00:00:00.000Z'
WHERE id = 'member-admin';

UPDATE users
SET email = 'BOLCCOP@Gmail.com',
    password_hash = 'Bolccop110550',
    updated_at = '2026-05-12T00:00:00.000Z'
WHERE id = 'user-admin';
