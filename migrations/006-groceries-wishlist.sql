-- Groceries list (shared via groups, tool = 'groceries') + private Wishlist.
-- Run after 005. Safe to re-run.

CREATE TABLE IF NOT EXISTS grocery_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  qty TEXT,
  note TEXT,
  category TEXT NOT NULL DEFAULT 'other',
  checked BOOLEAN NOT NULL DEFAULT false,
  cleared_at TIMESTAMPTZ, -- null = on the active list; set = in history
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE grocery_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own or group rows" ON grocery_items;
CREATE POLICY "Own or group rows" ON grocery_items
  FOR ALL
  USING (user_id = auth.uid() OR group_id IN (SELECT my_shared_groups('groceries')))
  WITH CHECK (user_id = auth.uid() OR group_id IN (SELECT my_shared_groups('groceries')));

CREATE TABLE IF NOT EXISTS wishlist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price DECIMAL(10,2),
  url TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  saved_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  target_date DATE,
  occasion TEXT,
  purchased BOOLEAN NOT NULL DEFAULT false,
  purchased_at TIMESTAMPTZ,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE wishlist_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own rows" ON wishlist_items;
CREATE POLICY "Own rows" ON wishlist_items
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Any group already sharing Shopping shares Groceries from day one.
INSERT INTO group_shares (group_id, tool)
SELECT group_id, 'groceries' FROM group_shares WHERE tool = 'shopping'
ON CONFLICT DO NOTHING;
