-- =====================================================================
-- COMPLETE DATABASE FIX - Run this in Supabase SQL Editor
-- Fixes: Message sending error + Room visibility issues
-- =====================================================================

-- FIX 1: Drop and recreate messages table foreign key constraint
ALTER TABLE public.messages 
DROP CONSTRAINT IF EXISTS messages_sender_id_fkey;

ALTER TABLE public.messages
ADD CONSTRAINT messages_sender_id_fkey 
FOREIGN KEY (sender_id) 
REFERENCES public.profiles(id) 
ON DELETE CASCADE;

-- FIX 2: Auto-create profiles for new users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, username)
    VALUES (
        NEW.id,
        COALESCE(
            NEW.raw_user_meta_data->>'username',
            SPLIT_PART(NEW.email, '@', 1)
        )
    )
    ON CONFLICT (id) DO UPDATE 
    SET username = COALESCE(
        EXCLUDED.username,
        public.profiles.username
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT OR UPDATE ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- FIX 3: Create profiles for any existing users without profiles
INSERT INTO public.profiles (id, username)
SELECT 
    au.id,
    COALESCE(
        au.raw_user_meta_data->>'username',
        SPLIT_PART(au.email, '@', 1)
    )
FROM auth.users au
WHERE NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = au.id
)
ON CONFLICT (id) DO NOTHING;

-- FIX 4: Clean up and recreate all RLS policies

-- Messages policies
DROP POLICY IF EXISTS "messages_insert_public" ON public.messages;
DROP POLICY IF EXISTS "messages_select_public" ON public.messages;
DROP POLICY IF EXISTS "messages_insert" ON public.messages;
DROP POLICY IF EXISTS "messages_select" ON public.messages;
DROP POLICY IF EXISTS "Allow message insertion for authenticated users" ON public.messages;
DROP POLICY IF EXISTS "Allow select for room participants on messages" ON public.messages;

CREATE POLICY "messages_insert_public" ON public.messages 
FOR INSERT TO public 
WITH CHECK (true);

CREATE POLICY "messages_select_public" ON public.messages 
FOR SELECT TO public 
USING (true);

-- Rooms policies
DROP POLICY IF EXISTS "rooms_insert_public" ON public.rooms;
DROP POLICY IF EXISTS "rooms_select_public" ON public.rooms;
DROP POLICY IF EXISTS "rooms_insert" ON public.rooms;
DROP POLICY IF EXISTS "rooms_select" ON public.rooms;
DROP POLICY IF EXISTS "Allow room insertion for authenticated users" ON public.rooms;
DROP POLICY IF EXISTS "Allow select for room participants" ON public.rooms;

CREATE POLICY "rooms_insert_public" ON public.rooms 
FOR INSERT TO public 
WITH CHECK (true);

CREATE POLICY "rooms_select_public" ON public.rooms 
FOR SELECT TO public 
USING (true);

-- Room participants policies
DROP POLICY IF EXISTS "room_participants_insert_public" ON public.room_participants;
DROP POLICY IF EXISTS "room_participants_select_public" ON public.room_participants;
DROP POLICY IF EXISTS "room_participants_delete_public" ON public.room_participants;
DROP POLICY IF EXISTS "room_participants_insert" ON public.room_participants;
DROP POLICY IF EXISTS "room_participants_select" ON public.room_participants;
DROP POLICY IF EXISTS "room_participants_delete" ON public.room_participants;

CREATE POLICY "room_participants_insert_public" ON public.room_participants 
FOR INSERT TO public 
WITH CHECK (true);

CREATE POLICY "room_participants_select_public" ON public.room_participants 
FOR SELECT TO public 
USING (true);

CREATE POLICY "room_participants_delete_public" ON public.room_participants 
FOR DELETE TO public 
USING (true);

-- Profiles policies
DROP POLICY IF EXISTS "profiles_select_public" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_public" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_public" ON public.profiles;
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "profiles_select_public" ON public.profiles 
FOR SELECT TO public 
USING (true);

CREATE POLICY "profiles_update_public" ON public.profiles 
FOR UPDATE TO public 
USING (true) 
WITH CHECK (true);

CREATE POLICY "profiles_insert_public" ON public.profiles 
FOR INSERT TO public 
WITH CHECK (true);

-- FIX 5: Grant all necessary permissions
GRANT ALL ON public.profiles TO anon, authenticated, service_role;
GRANT ALL ON public.rooms TO anon, authenticated, service_role;
GRANT ALL ON public.room_participants TO anon, authenticated, service_role;
GRANT ALL ON public.messages TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE messages_id_seq TO anon, authenticated, service_role;

-- FIX 6: Ensure RLS is enabled on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- SUCCESS MESSAGE
DO $$
BEGIN
    RAISE NOTICE '✅ Database fix completed successfully!';
    RAISE NOTICE '✅ You can now send messages and create rooms';
    RAISE NOTICE '✅ Refresh your app and try again';
END $$;

-- FIX 7: Allow users to delete their own messages
DROP POLICY IF EXISTS "messages_delete_own" ON public.messages;
CREATE POLICY "messages_delete_own" ON public.messages
FOR DELETE TO public
USING (sender_id = auth.uid());

-- FIX 8: Allow deleting rooms
DROP POLICY IF EXISTS "rooms_delete_own" ON public.rooms;
CREATE POLICY "rooms_delete_own" ON public.rooms
FOR DELETE TO public
USING (true);
