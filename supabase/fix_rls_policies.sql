DROP POLICY IF EXISTS "room_participants_select" ON public.room_participants;
DROP POLICY IF EXISTS "Allow select for room members" ON public.room_participants;

CREATE POLICY "room_participants_select" 
ON public.room_participants FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow select for room members" 
ON public.room_participants FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "room_participants_insert" ON public.room_participants;
DROP POLICY IF EXISTS "Allow members creation" ON public.room_participants;
CREATE POLICY "room_participants_insert" 
ON public.room_participants FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "room_participants_delete" ON public.room_participants;
DROP POLICY IF EXISTS "Allow users to delete their own participation" ON public.room_participants;
CREATE POLICY "room_participants_delete" 
ON public.room_participants FOR DELETE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "rooms_select" ON public.rooms;
DROP POLICY IF EXISTS "Allow select for room participants" ON public.rooms;
CREATE POLICY "rooms_select" 
ON public.rooms FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.room_participants
        WHERE room_participants.room_id = rooms.id
          AND room_participants.user_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "rooms_insert" ON public.rooms;
DROP POLICY IF EXISTS "Allow room insertion for authenticated users" ON public.rooms;
CREATE POLICY "rooms_insert" 
ON public.rooms FOR INSERT TO authenticated WITH CHECK (true);
