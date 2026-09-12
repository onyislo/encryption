-- =====================================================================
-- fix_realtime_messages.sql
-- Run this in your Supabase SQL editor to fix realtime + RLS for messages
-- =====================================================================

-- 1. Enable Realtime publication for the messages table
--    (Supabase Realtime listens to the "supabase_realtime" publication)
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- 2. Make sure RLS is enabled on messages (it should already be)
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- 3. Grant basic access
GRANT ALL ON public.messages TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- 4. Drop old conflicting policies
DROP POLICY IF EXISTS "messages_insert" ON public.messages;
DROP POLICY IF EXISTS "messages_select" ON public.messages;
DROP POLICY IF EXISTS "messages_delete" ON public.messages;
DROP POLICY IF EXISTS "Allow insert for authenticated users" ON public.messages;
DROP POLICY IF EXISTS "Allow select for room participants" ON public.messages;
DROP POLICY IF EXISTS "Allow delete for message owner" ON public.messages;
DROP POLICY IF EXISTS "messages_insert_public" ON public.messages;
DROP POLICY IF EXISTS "messages_select_public" ON public.messages;
DROP POLICY IF EXISTS "messages_delete_public" ON public.messages;

-- 5. Create open policies so any authenticated (or anon) user can read/write
--    This matches the approach used for rooms/room_participants above.
CREATE POLICY "messages_select_public"
  ON public.messages FOR SELECT TO public USING (true);

CREATE POLICY "messages_insert_public"
  ON public.messages FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "messages_delete_public"
  ON public.messages FOR DELETE TO public
  USING (sender_id = auth.uid());

-- 6. Also make sure profiles are readable (for sender name lookups)
DROP POLICY IF EXISTS "profiles_select_public" ON public.profiles;
CREATE POLICY "profiles_select_public"
  ON public.profiles FOR SELECT TO public USING (true);
