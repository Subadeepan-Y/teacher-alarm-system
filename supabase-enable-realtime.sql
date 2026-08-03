-- Run this ONCE in the Supabase SQL Editor.
--
-- Why: a websocket client can join the realtime channel and still never
-- receive a single row change if the table is not part of the
-- `supabase_realtime` publication. That is the "subscribed but nothing ever
-- arrives" case the ESP32 was hitting.

-- 1. Make sure the publication exists.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

-- 2. Add the slots table to it (ignore the error if it is already there).
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.slots;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 3. Emit the full row on UPDATE/DELETE so the payload contains `record`.
ALTER TABLE public.slots REPLICA IDENTITY FULL;

-- 4. Realtime respects RLS. The anon/publishable key must be able to SELECT,
--    otherwise the channel joins and then stays silent.
ALTER TABLE public.slots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "slots readable" ON public.slots;
CREATE POLICY "slots readable" ON public.slots FOR SELECT USING (true);

-- Verify:
-- SELECT schemaname, tablename FROM pg_publication_tables
-- WHERE pubname = 'supabase_realtime';
