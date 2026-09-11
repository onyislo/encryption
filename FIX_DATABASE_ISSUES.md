# Fix Database Issues - Complete Guide

## Issues to Fix:
1. **Message sending error**: "violates foreign key constraint messages_sender_id_fkey"
2. **Room creation**: Rooms created but not visible in the UI

---

## Step 1: Fix the Database Schema

### Option A: Run SQL in Supabase Dashboard (RECOMMENDED)

1. **Go to your Supabase Project Dashboard**
   - Navigate to: https://supabase.com/dashboard
   - Select your project

2. **Open SQL Editor**
   - Click on "SQL Editor" in the left sidebar
   - Click "New Query"

3. **Copy and paste this SQL code**:

```sql
-- =====================================================================
-- COMPLETE DATABASE FIX
-- This fixes both the message constraint and room visibility issues
-- =====================================================================

-- FIX 1: Drop and recreate messages table with correct constraint
ALTER TABLE public.messages 
DROP CONSTRAINT IF EXISTS messages_sender_id_fkey;

ALTER TABLE public.messages
ADD CONSTRAINT messages_sender_id_fkey 
FOREIGN KEY (sender_id) 
REFERENCES public.profiles(id) 
ON DELETE CASCADE;

-- FIX 2: Ensure profiles are created automatically for new users
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

-- FIX 3: Create profiles for existing users (if any are missing)
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

-- FIX 4: Fix RLS policies for all tables
-- Messages policies
DROP POLICY IF EXISTS "messages_insert_public" ON public.messages;
DROP POLICY IF EXISTS "messages_select_public" ON public.messages;
DROP POLICY IF EXISTS "messages_insert" ON public.messages;
DROP POLICY IF EXISTS "messages_select" ON public.messages;

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

-- FIX 5: Grant necessary permissions
GRANT ALL ON public.profiles TO anon, authenticated, service_role;
GRANT ALL ON public.rooms TO anon, authenticated, service_role;
GRANT ALL ON public.room_participants TO anon, authenticated, service_role;
GRANT ALL ON public.messages TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE messages_id_seq TO anon, authenticated, service_role;

-- FIX 6: Ensure RLS is enabled
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
```

4. **Click "Run"** to execute the SQL

---

## Step 2: Verify the Fix

### Test Message Sending:
1. Open your app
2. Go to any chat
3. Try sending a message
4. ✅ Should work without errors

### Test Room Creation:
1. Click "Create Room" or "New Room"
2. Enter a room name (e.g., "Test Room")
3. Click Create
4. ✅ Room should appear in your chat list under "CHAT ROOMS"

---

## Step 3: If Issues Persist

### Clear your browser data:
```
1. Open browser DevTools (F12)
2. Go to Application/Storage tab
3. Click "Clear site data"
4. Refresh the page
5. Login again
```

### Check Supabase logs:
```
1. Go to Supabase Dashboard
2. Click "Logs" in left sidebar
3. Look for any error messages
4. Share them if you need more help
```

---

## Common Issues & Solutions

### Issue: "Still can't send messages"
**Solution**: Make sure your user has a profile entry
- Run this in SQL Editor:
```sql
SELECT * FROM public.profiles WHERE id = auth.uid();
```
- If empty, the trigger didn't work. Logout and login again.

### Issue: "Rooms created but not showing"
**Solution**: Check if room_participants entry was created
- Run this in SQL Editor:
```sql
SELECT * FROM public.room_participants WHERE user_id = auth.uid();
```
- If empty, the room creation failed. Try creating a new room.

### Issue: "Foreign key constraint error persists"
**Solution**: Your user might not be in the profiles table
- Run this to add yourself:
```sql
INSERT INTO public.profiles (id, username)
SELECT id, SPLIT_PART(email, '@', 1)
FROM auth.users
WHERE id = auth.uid()
ON CONFLICT (id) DO NOTHING;
```

---

## Need More Help?

If you're still having issues after running the SQL fix:

1. **Screenshot the exact error message**
2. **Check Supabase SQL Editor logs** (bottom of the editor)
3. **Verify your .env file** has correct Supabase credentials
4. **Try creating a test account** to see if new users work

---

## Summary

After running the SQL fix above, you should be able to:
- ✅ Send messages without errors
- ✅ Create rooms and see them in the list
- ✅ Start direct messages with other users
- ✅ See all your chats properly

The main issue was:
1. Foreign key constraint had `ON DELETE SET NULL` but column was `NOT NULL`
2. Missing RLS policies were blocking operations
3. Profiles might not have been created for some users
