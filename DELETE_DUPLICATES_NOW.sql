-- =====================================================================
-- DELETE DUPLICATE @Manuspecs ROOMS - RUN THIS NOW!
-- =====================================================================

-- Step 1: See all your @Manuspecs rooms
SELECT 
    r.id,
    r.name,
    r.type,
    r.created_at,
    'Room #' || ROW_NUMBER() OVER (PARTITION BY r.name ORDER BY r.created_at) as duplicate_number
FROM rooms r
WHERE r.name LIKE '%Manuspecs%'
ORDER BY r.created_at;

-- Step 2: Delete the NEWER duplicate (keeps the oldest one)
-- This will automatically delete the newer @Manuspecs room
DELETE FROM rooms
WHERE id IN (
    SELECT id
    FROM (
        SELECT 
            id,
            ROW_NUMBER() OVER (PARTITION BY name, type ORDER BY created_at DESC) as rn
        FROM rooms
        WHERE name LIKE '%Manuspecs%'
    ) sub
    WHERE rn > 1
);

-- Step 3: Verify - Should show only ONE @Manuspecs room now
SELECT 
    r.id,
    r.name,
    r.created_at
FROM rooms r
WHERE r.name LIKE '%Manuspecs%';
