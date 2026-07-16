-- Phase 5: sharing groups — admin-managed groups whose members share
-- chosen tools (initially 'shopping' and 'cookbook'). Run after 004.
-- Safe to re-run.

-- 1. Tables
CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS group_members (
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
);
CREATE TABLE IF NOT EXISTS group_shares (
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  tool TEXT NOT NULL, -- 'shopping' | 'cookbook' (extensible)
  PRIMARY KEY (group_id, tool)
);

-- 2. Helper functions. SECURITY DEFINER so policies can consult membership
-- without recursive RLS evaluation.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT COALESCE((SELECT is_admin FROM profiles WHERE id = auth.uid()), false)
$$;

CREATE OR REPLACE FUNCTION public.my_groups()
RETURNS SETOF UUID LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT group_id FROM group_members WHERE user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.my_shared_groups(p_tool TEXT)
RETURNS SETOF UUID LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT gm.group_id
  FROM group_members gm
  JOIN group_shares gs ON gs.group_id = gm.group_id AND gs.tool = p_tool
  WHERE gm.user_id = auth.uid()
$$;

-- 3. RLS: members can see their groups; only admins manage them.
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read, admins manage" ON groups;
CREATE POLICY "Members read, admins manage" ON groups
  FOR SELECT USING (is_admin() OR id IN (SELECT my_groups()));
DROP POLICY IF EXISTS "Admins write" ON groups;
CREATE POLICY "Admins write" ON groups
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Members read, admins manage" ON group_members;
CREATE POLICY "Members read, admins manage" ON group_members
  FOR SELECT USING (is_admin() OR group_id IN (SELECT my_groups()));
DROP POLICY IF EXISTS "Admins write" ON group_members;
CREATE POLICY "Admins write" ON group_members
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Members read, admins manage" ON group_shares;
CREATE POLICY "Members read, admins manage" ON group_shares
  FOR SELECT USING (is_admin() OR group_id IN (SELECT my_groups()));
DROP POLICY IF EXISTS "Admins write" ON group_shares;
CREATE POLICY "Admins write" ON group_shares
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- 4. Shareable tables get a nullable group_id + own-or-group policies.
ALTER TABLE shopping_items ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES groups(id) ON DELETE SET NULL;
ALTER TABLE cookbook_recipes ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES groups(id) ON DELETE SET NULL;

DROP POLICY IF EXISTS "Own rows" ON shopping_items;
DROP POLICY IF EXISTS "Own or group rows" ON shopping_items;
CREATE POLICY "Own or group rows" ON shopping_items
  FOR ALL
  USING (user_id = auth.uid() OR group_id IN (SELECT my_shared_groups('shopping')))
  WITH CHECK (user_id = auth.uid() OR group_id IN (SELECT my_shared_groups('shopping')));

-- Price history piggybacks on item visibility (the shopping_items policy
-- runs inside the subquery), so group members see shared items' prices.
DROP POLICY IF EXISTS "Own rows" ON shopping_prices;
DROP POLICY IF EXISTS "Own or group rows" ON shopping_prices;
CREATE POLICY "Own or group rows" ON shopping_prices
  FOR ALL
  USING (user_id = auth.uid() OR item_id IN (SELECT id FROM shopping_items))
  WITH CHECK (user_id = auth.uid() OR item_id IN (SELECT id FROM shopping_items));

DROP POLICY IF EXISTS "Own rows" ON cookbook_recipes;
DROP POLICY IF EXISTS "Own or group rows" ON cookbook_recipes;
CREATE POLICY "Own or group rows" ON cookbook_recipes
  FOR ALL
  USING (user_id = auth.uid() OR group_id IN (SELECT my_shared_groups('cookbook')))
  WITH CHECK (user_id = auth.uid() OR group_id IN (SELECT my_shared_groups('cookbook')));

-- 5. Seed: "Family" group with the owner, sharing shopping + cookbook,
-- and adopt the owner's existing rows into it.
DO $$
DECLARE
  owner_id UUID;
  gid UUID;
BEGIN
  SELECT id INTO owner_id FROM profiles WHERE email = 'aaronnguyen35435@gmail.com';
  IF owner_id IS NULL THEN
    RAISE EXCEPTION 'Owner profile not found';
  END IF;

  SELECT id INTO gid FROM groups WHERE name = 'Family' LIMIT 1;
  IF gid IS NULL THEN
    INSERT INTO groups (name, created_by) VALUES ('Family', owner_id) RETURNING id INTO gid;
  END IF;

  INSERT INTO group_members (group_id, user_id) VALUES (gid, owner_id) ON CONFLICT DO NOTHING;
  INSERT INTO group_shares (group_id, tool) VALUES (gid, 'shopping'), (gid, 'cookbook') ON CONFLICT DO NOTHING;

  UPDATE shopping_items SET group_id = gid WHERE user_id = owner_id AND group_id IS NULL;
  UPDATE cookbook_recipes SET group_id = gid WHERE user_id = owner_id AND group_id IS NULL;
END $$;
