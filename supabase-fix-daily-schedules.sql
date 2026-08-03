-- Run this ONCE in the Supabase SQL Editor.
--
-- WHY THE ESP32 NEVER SEES DAILY (per-date) CHANGES
-- -------------------------------------------------
-- `slots` (the master weekly timetable) has a wide-open policy:
--     CREATE POLICY "Allow all operations for now" ON slots FOR ALL USING (true)
-- so ANY key, including the anon/publishable key, can read it.
--
-- `daily_schedules` (today-only overrides) only had:
--     FOR ALL TO authenticated USING (auth.uid() = user_id)
-- so a request that is NOT a logged-in browser session reads back ZERO rows.
-- /api/status (the endpoint the ESP32 polls) falls back to the anon key when
-- SUPABASE_SERVICE_ROLE_KEY is missing, so on the device the override query
-- silently returned nothing and only weekly `slots` values survived.
--
-- That is exactly the asymmetry you described:
--   timetable tab edits (slots)             -> visible on ESP
--   dashboard popup edits (daily_schedules) -> invisible on ESP

CREATE TABLE IF NOT EXISTS daily_schedules (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  periods JSONB NOT NULL DEFAULT '[]'::jsonb,
  reviewed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- The upsert in useDailySchedule.ts uses ON CONFLICT (user_id, date).
-- Without this index every save fails with Postgres 42P10.
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_schedules_user_date
  ON daily_schedules (user_id, date);

-- Helps the "latest override for today" fallback query in /api/status.
CREATE INDEX IF NOT EXISTS idx_daily_schedules_date
  ON daily_schedules (date, reviewed_at DESC);

ALTER TABLE daily_schedules ENABLE ROW LEVEL SECURITY;

-- Writes stay locked to the owning teacher.
DROP POLICY IF EXISTS "Users can manage their own daily schedules" ON daily_schedules;
DROP POLICY IF EXISTS "Owner can insert own daily schedule" ON daily_schedules;
DROP POLICY IF EXISTS "Owner can update own daily schedule" ON daily_schedules;
DROP POLICY IF EXISTS "Owner can delete own daily schedule" ON daily_schedules;

CREATE POLICY "Owner can insert own daily schedule"
  ON daily_schedules FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner can update own daily schedule"
  ON daily_schedules FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner can delete own daily schedule"
  ON daily_schedules FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- READS are open, exactly like `slots` already is. This is what lets the ESP32
-- (anon key) actually see today's overrides.
DROP POLICY IF EXISTS "daily schedules readable" ON daily_schedules;
CREATE POLICY "daily schedules readable"
  ON daily_schedules FOR SELECT USING (true);

-- Optional: realtime, same treatment slots got in supabase-enable-realtime.sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_schedules;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.daily_schedules REPLICA IDENTITY FULL;

-- Sanity check: should return today's override row(s).
-- SELECT user_id, date, reviewed_at, periods FROM daily_schedules
-- WHERE date = to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD');
