-- Phase 4: per-user Google Calendar tokens, captured from Supabase Auth's
-- provider tokens at sign-in (replaces NextAuth). Safe to re-run.

CREATE TABLE IF NOT EXISTS google_tokens (
  user_id UUID PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  refresh_token TEXT NOT NULL,
  access_token TEXT,
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE google_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own rows" ON google_tokens;
CREATE POLICY "Own rows" ON google_tokens
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
