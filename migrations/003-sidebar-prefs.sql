-- Phase 3: per-user sidebar preferences (order + hidden + rename).
-- Replaces the global sidebar_order table. Run after 002. Safe to re-run.

CREATE TABLE IF NOT EXISTS sidebar_prefs (
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  href TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  hidden BOOLEAN NOT NULL DEFAULT false,
  custom_label TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, href)
);
ALTER TABLE sidebar_prefs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own rows" ON sidebar_prefs;
CREATE POLICY "Own rows" ON sidebar_prefs
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Carry the owner's existing order over, then retire the old table.
DO $$
DECLARE
  owner_id UUID;
BEGIN
  SELECT id INTO owner_id FROM profiles WHERE email = 'aaronnguyen35435@gmail.com';
  IF owner_id IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sidebar_order') THEN
    INSERT INTO sidebar_prefs (user_id, href, position)
    SELECT owner_id, href, position FROM sidebar_order
    ON CONFLICT (user_id, href) DO NOTHING;
    DROP TABLE sidebar_order;
  END IF;
END $$;
