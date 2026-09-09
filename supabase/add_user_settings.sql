-- =====================================================================
-- SecureChat — ADD USER SETTINGS TABLE
-- Run this in your Supabase SQL Editor after the main setup.
-- Stores per-user preferences so settings persist across sessions.
-- =====================================================================


-- =====================================================================
-- STEP 1: CREATE TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.user_settings (
    user_id          UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    dark_mode        BOOLEAN NOT NULL DEFAULT false,
    notifications    BOOLEAN NOT NULL DEFAULT true,
    auto_lock        BOOLEAN NOT NULL DEFAULT true,
    read_receipts    BOOLEAN NOT NULL DEFAULT true,
    message_previews BOOLEAN NOT NULL DEFAULT true,
    language         VARCHAR(50) NOT NULL DEFAULT 'English (US)',
    updated_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- In case table exists without new columns:
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS message_previews BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS language VARCHAR(50) NOT NULL DEFAULT 'English (US)';

-- =====================================================================
-- STEP 2: ENABLE ROW LEVEL SECURITY
-- =====================================================================

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;


-- =====================================================================
-- STEP 3: RLS POLICIES
-- Users can only read and write their own settings.
-- =====================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'user_settings_select') THEN
        CREATE POLICY "user_settings_select" ON public.user_settings FOR SELECT TO authenticated USING (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'user_settings_insert') THEN
        CREATE POLICY "user_settings_insert" ON public.user_settings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'user_settings_update') THEN
        CREATE POLICY "user_settings_update" ON public.user_settings FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;


-- =====================================================================
-- DONE! Each user now has a row of persistent preferences.
-- =====================================================================
