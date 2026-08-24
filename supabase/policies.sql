-- =====================================================================
-- supabase/policies.sql
-- Row-Level Security (RLS) policies for SecureChat
-- =====================================================================

------------------------------------------------------------------------
-- PROFILES POLICIES
------------------------------------------------------------------------

-- Allow select access to any authenticated user so they can get public keys
CREATE POLICY "Allow public select for authenticated users" 
ON public.profiles FOR SELECT TO authenticated USING (true);

-- Allow users to create their own initial profile record
CREATE POLICY "Allow owners to insert profile" 
ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Allow users to update their own profile fields
CREATE POLICY "Allow owners to update profile" 
ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);


------------------------------------------------------------------------
-- ROOMS POLICIES
------------------------------------------------------------------------

-- Allow users to view rooms they are actively participating in
CREATE POLICY "Allow select for room participants" 
ON public.rooms FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.room_participants
        WHERE room_participants.room_id = id AND room_participants.user_id = auth.uid()
    )
);

-- Allow authenticated users to create chat rooms
CREATE POLICY "Allow room insertion for authenticated users" 
ON public.rooms FOR INSERT TO authenticated WITH CHECK (true);


------------------------------------------------------------------------
-- ROOM PARTICIPANTS POLICIES
------------------------------------------------------------------------

-- Allow users to select participation records for their rooms
CREATE POLICY "Allow select for room members" 
ON public.room_participants FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.room_participants AS rp
        WHERE rp.room_id = room_id AND rp.user_id = auth.uid()
    )
);

-- Allow users to join a room or add other users to rooms
CREATE POLICY "Allow members creation" 
ON public.room_participants FOR INSERT TO authenticated WITH CHECK (true);

-- Allow users to leave a room (delete their participation row)
CREATE POLICY "Allow users to delete their own participation" 
ON public.room_participants FOR DELETE TO authenticated USING (user_id = auth.uid());


------------------------------------------------------------------------
-- MESSAGES POLICIES
------------------------------------------------------------------------

-- Allow users to read messages in rooms they are a member of
CREATE POLICY "Allow select messages for room participants" 
ON public.messages FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.room_participants
        WHERE room_participants.room_id = room_id AND room_participants.user_id = auth.uid()
    )
);

-- Allow users to write messages to rooms they are a member of
CREATE POLICY "Allow insert messages for room participants" 
ON public.messages FOR INSERT TO authenticated WITH CHECK (
    sender_id = auth.uid() AND
    EXISTS (
        SELECT 1 FROM public.room_participants
        WHERE room_participants.room_id = room_id AND room_participants.user_id = auth.uid()
    )
);
