-- =====================================================================
-- Remove Duplicate Direct Message Rooms - SIMPLE MANUAL FIX
-- =====================================================================

-- Step 1: View all your direct message rooms to find duplicates
SELECT 
    r.id,
    r.name,
    r.created_at,
    (
        SELECT STRING_AGG(p.username, ', ')
        FROM room_participants rp2
        JOIN profiles p ON p.id = rp2.user_id
        WHERE rp2.room_id = r.id
    ) as participants
FROM rooms r
WHERE r.type = 'direct'
AND EXISTS (
    SELECT 1 FROM room_participants rp WHERE rp.room_id = r.id AND rp.user_id = auth.uid()
)
ORDER BY r.name, r.created_at;

-- Step 2: Delete specific duplicate rooms
-- Copy the room ID from above and paste it below
-- Example: If you see two "@Manuspecs" rooms, delete the NEWER one (later created_at)

-- UNCOMMENT AND REPLACE WITH ACTUAL ROOM ID:
-- DELETE FROM rooms WHERE id = 'paste-room-id-here';

-- Example for multiple duplicates:
-- DELETE FROM rooms WHERE id IN (
--     'paste-first-duplicate-id',
--     'paste-second-duplicate-id'
-- );


