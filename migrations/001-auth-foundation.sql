-- Phase 1: auth foundation — profiles, invite allowlist, signup gate.
-- Run in the Supabase SQL editor. Safe to re-run.

-- 1. Profiles: one row per auth user, auto-created on signup.
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Signed-in users can read profiles" ON profiles;
CREATE POLICY "Signed-in users can read profiles" ON profiles
  FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Users update own profile" ON profiles;
CREATE POLICY "Users update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- 2. Invite allowlist. is_admin here is copied onto the profile at signup.
CREATE TABLE IF NOT EXISTS allowed_users (
  email TEXT PRIMARY KEY,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE allowed_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage allowlist" ON allowed_users;
CREATE POLICY "Admins manage allowlist" ON allowed_users
  FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin));

-- 3. Signup gate + profile bootstrap. Raising here aborts the auth.users
-- insert, so non-invited Google sign-ins fail (surfaced to the app as
-- "Database error saving new user").
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite allowed_users%ROWTYPE;
BEGIN
  SELECT * INTO invite FROM allowed_users WHERE lower(email) = lower(NEW.email);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_invited';
  END IF;

  INSERT INTO public.profiles (id, email, display_name, avatar_url, is_admin)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url',
    invite.is_admin
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Seed the owner/admin.
INSERT INTO allowed_users (email, is_admin)
VALUES ('aaronnguyen35435@gmail.com', true)
ON CONFLICT (email) DO UPDATE SET is_admin = true;
