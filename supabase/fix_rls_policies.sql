GRANT ALL ON public.rooms TO anon, authenticated, service_role;
GRANT ALL ON public.room_participants TO anon, authenticated, service_role;

ALTER TABLE public.rooms DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_participants DISABLE ROW LEVEL SECURITY;

-- Drop legacy and current policies for rooms
DROP POLICY IF EXISTS "rooms_insert" ON public.rooms;
DROP POLICY IF EXISTS "rooms_select" ON public.rooms;
DROP POLICY IF EXISTS "Allow room insertion for authenticated users" ON public.rooms;
DROP POLICY IF EXISTS "Allow select for room participants" ON public.rooms;
DROP POLICY IF EXISTS "rooms_insert_public" ON public.rooms;
DROP POLICY IF EXISTS "rooms_select_public" ON public.rooms;

CREATE POLICY "rooms_insert_public" ON public.rooms FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "rooms_select_public" ON public.rooms FOR SELECT TO public USING (true);

-- Drop legacy and current policies for room_participants
DROP POLICY IF EXISTS "room_participants_insert" ON public.room_participants;
DROP POLICY IF EXISTS "room_participants_select" ON public.room_participants;
DROP POLICY IF EXISTS "room_participants_delete" ON public.room_participants;
DROP POLICY IF EXISTS "room_participants_insert_public" ON public.room_participants;
DROP POLICY IF EXISTS "room_participants_select_public" ON public.room_participants;
DROP POLICY IF EXISTS "room_participants_delete_public" ON public.room_participants;

CREATE POLICY "room_participants_insert_public" ON public.room_participants FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "room_participants_select_public" ON public.room_participants FOR SELECT TO public USING (true);
CREATE POLICY "room_participants_delete_public" ON public.room_participants FOR DELETE TO public USING (true);

