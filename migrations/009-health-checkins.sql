-- Apple Health daily check-ins: a Bevel-style manual daily ritual (quick mood
-- rating + optional note) separate from the auto-synced iOS Shortcut data.
-- Powers the check-in streak shown on the Health page and dashboard widget.
-- Run after 008. Safe to re-run.

CREATE TABLE IF NOT EXISTS apple_health_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  mood INTEGER, -- 1-5, optional
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, date)
);
ALTER TABLE apple_health_checkins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own rows" ON apple_health_checkins;
CREATE POLICY "Own rows" ON apple_health_checkins
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
