-- =====================================================================
-- DEBUG QUERIES - Run these to check your database status
-- Use these to find out what's wrong if things still don't work
-- =====================================================================

-- 1. CHECK IF YOUR USER HAS A PROFILE
-- Run this first - you MUST have a profile to send messages
SELECT 
    id,
    username,
    created_at,
    'Profile exists!' as status
FROM public.profiles 
WHERE id = auth.uid();

-- If above returns nothing, you don't have a profile!
-- This is the main reason for message errors


-- 2. CHECK ALL YOUR ROOMS
-- See all rooms you're part of
SELECT 
    r.id,
    r.name,
    r.type,
    r.created_at,
    COUNT(rp.user_id) as participant_count
FROM public.rooms r
JOIN public.room_participants rp ON r.id = rp.room_id
WHERE rp.user_id = auth.uid()
GROUP BY r.id, r.name, r.type, r.created_at
ORDER BY r.created_at DESC;


-- 3. CHECK YOUR ROOM PARTICIPATIONS
-- See which rooms you're registered in
SELECT 
    rp.room_id,
    r.name as room_name,
    r.type,
    rp.joined_at
FROM public.room_participants rp
JOIN public.rooms r ON r.id = rp.room_id
WHERE rp.user_id = auth.uid()
ORDER BY rp.joined_at DESC;


-- 4. CHECK YOUR MESSAGES
-- See all messages you've sent
SELECT 
    m.id,
    m.room_id,
    r.name as room_name,
    m.encrypted_content,
    m.created_at
FROM public.messages m
LEFT JOIN public.rooms r ON r.id = m.room_id
WHERE m.sender_id = auth.uid()
ORDER BY m.created_at DESC
LIMIT 10;


-- 5. CHECK DATABASE CONSTRAINTS
-- See if the foreign key is set up correctly
SELECT
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
JOIN information_schema.referential_constraints AS rc
    ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_name = 'messages'
    AND kcu.column_name = 'sender_id';


-- 6. CHECK RLS POLICIES
-- See what policies exist for messages table
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd
FROM pg_policies
WHERE tablename IN ('messages', 'rooms', 'room_participants', 'profiles')
ORDER BY tablename, policyname;


-- 7. CHECK ALL USERS AND PROFILES
-- See which users have profiles
SELECT 
    au.id,
    au.email,
    au.created_at as user_created,
    p.username,
    p.created_at as profile_created,
    CASE 
        WHEN p.id IS NULL THEN '❌ NO PROFILE'
        ELSE '✅ HAS PROFILE'
    END as status
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id
ORDER BY au.created_at DESC;


-- 8. CHECK TABLE PERMISSIONS
-- See what permissions each role has
SELECT 
    grantee,
    table_schema,
    table_name,
    privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
    AND table_name IN ('messages', 'rooms', 'room_participants', 'profiles')
    AND grantee IN ('anon', 'authenticated', 'service_role')
ORDER BY table_name, grantee, privilege_type;


-- =====================================================================
-- EMERGENCY FIXES - Run these if you find issues above
-- =====================================================================

-- FIX: Create profile for current user if missing
-- (Only run if query #1 returns nothing)
/*
INSERT INTO public.profiles (id, username)
SELECT id, SPLIT_PART(email, '@', 1)
FROM auth.users
WHERE id = auth.uid()
ON CONFLICT (id) DO NOTHING;
*/


-- FIX: Create profiles for ALL users missing them
-- (Run if query #7 shows users without profiles)
/*
INSERT INTO public.profiles (id, username)
SELECT 
    au.id,
    SPLIT_PART(au.email, '@', 1)
FROM auth.users au
WHERE NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = au.id
)
ON CONFLICT (id) DO NOTHING;
*/


-- FIX: Delete orphaned room_participants (rooms that don't exist)
-- (Only run if you see weird data)
/*
DELETE FROM public.room_participants
WHERE room_id NOT IN (SELECT id FROM public.rooms);
*/


-- FIX: Delete orphaned messages (rooms that don't exist)
-- (Only run if you see weird data)
/*
DELETE FROM public.messages
WHERE room_id NOT IN (SELECT id FROM public.rooms);
*/
