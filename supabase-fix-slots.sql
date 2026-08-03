-- Run this ONCE in the Supabase SQL Editor.
--
-- Why: the app upserts slots with ON CONFLICT (day, period_time). If the table
-- was created without that unique index, every single save fails with
-- "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification" (Postgres 42P10) - which is why timetable entries never
-- reached the backend and vanished on refresh.

CREATE TABLE IF NOT EXISTS slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day TEXT NOT NULL,
  period_time TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Remove duplicate (day, period_time) rows, keeping the most recently updated
-- one, so the unique index below can be created.
DELETE FROM slots a
USING slots b
WHERE a.day = b.day
  AND a.period_time = b.period_time
  AND a.id <> b.id
  AND (
    COALESCE(a.updated_at, a.created_at, 'epoch'::timestamptz)
      < COALESCE(b.updated_at, b.created_at, 'epoch'::timestamptz)
    OR (
      COALESCE(a.updated_at, a.created_at, 'epoch'::timestamptz)
        = COALESCE(b.updated_at, b.created_at, 'epoch'::timestamptz)
      AND a.id < b.id
    )
  );

-- The index the upsert depends on.
CREATE UNIQUE INDEX IF NOT EXISTS idx_slots_day_period ON slots (day, period_time);

ALTER TABLE slots ENABLE ROW LEVEL SECURITY;

-- The API writes with the service-role key, which bypasses RLS. This policy
-- only matters for direct client reads.
DROP POLICY IF EXISTS "Allow all operations for now" ON slots;
CREATE POLICY "Allow all operations for now" ON slots
  FOR ALL USING (true) WITH CHECK (true);

-- Sanity check: this should return one row per (day, period_time).
-- SELECT day, period_time, count(*) FROM slots GROUP BY 1, 2 HAVING count(*) > 1;
