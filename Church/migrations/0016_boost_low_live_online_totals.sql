-- Give existing archived live broadcasts with fewer than 5 online viewers a
-- one-time random increase of 3-6. Future archives apply the same rule in code.
UPDATE sermons
SET live_online_total = COALESCE(live_online_total, 0) + 3 + (RANDOM() & 3)
WHERE category = 'live-broadcast'
  AND COALESCE(live_online_total, 0) < 5;
