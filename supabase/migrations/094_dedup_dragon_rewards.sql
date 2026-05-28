-- Migration 094: Remove duplicate rewards created by migrations 092 + 093 overlap
-- Both migrations inserted the same 47 rows; keep the oldest (from 092), delete the newer duplicates

DELETE FROM rewards
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY name, reward_type, criteria_type, criteria_value
             ORDER BY created_at ASC, id ASC
           ) AS rn
    FROM rewards
  ) ranked
  WHERE rn > 1
);
