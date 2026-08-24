-- =====================================================================
-- supabase/triggers.sql
-- PostgreSQL Triggers for auth to public synchronization
-- =====================================================================

-- 1. Trigger function that executes upon a user signing up in Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, public_key)
  VALUES (
    NEW.id,
    -- Set default username based on the first part of their email address,
    -- or fallback to a string with user UUID segment if email is absent
    COALESCE(
      SPLIT_PART(NEW.email, '@', 1), 
      'user_' || SUBSTRING(NEW.id::TEXT FROM 1 FOR 8)
    ),
    NULL -- Public key will be updated by the frontend React application on first login
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Trigger definition
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW 
  EXECUTE FUNCTION public.handle_new_user();
