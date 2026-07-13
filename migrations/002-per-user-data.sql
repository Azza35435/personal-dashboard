-- Phase 2: per-user data — user_id on every data table, backfill to the
-- owner, real RLS. Run AFTER 001 and AFTER the owner has signed in once
-- (the backfill looks up the profile by email and aborts if missing).
-- Safe to re-run.

DO $$
DECLARE
  owner_id UUID;
  t TEXT;
  tables TEXT[] := ARRAY[
    'accounts', 'income_streams', 'todos', 'notes', 'habits',
    'habit_completions', 'habit_groups', 'sections', 'todo_sections',
    'nutrition_logs', 'gym_sessions', 'gym_exercises', 'gym_templates',
    'gym_template_exercises', 'cookbook_recipes', 'curriculars',
    'curricular_metrics', 'curricular_notes', 'curricular_links',
    'curricular_deadlines', 'subscriptions', 'dashboard_layout',
    'goal_categories', 'goals', 'goal_milestones', 'goal_decisions',
    'shopping_items', 'shopping_prices', 'apple_health_logs'
  ];
BEGIN
  SELECT id INTO owner_id FROM profiles WHERE email = 'aaronnguyen35435@gmail.com';
  IF owner_id IS NULL THEN
    RAISE EXCEPTION 'Owner profile not found — sign in with Google once before running this migration';
  END IF;

  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE', t);
    EXECUTE format('UPDATE %I SET user_id = %L WHERE user_id IS NULL', t, owner_id);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN user_id SET DEFAULT auth.uid()', t);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN user_id SET NOT NULL', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Allow all" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Own rows" ON %I', t);
    EXECUTE format('CREATE POLICY "Own rows" ON %I FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())', t);
  END LOOP;
END $$;

-- notes: was a single hardcoded row (id = 1); becomes one row per user.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notes' AND column_name = 'id') THEN
    ALTER TABLE notes DROP CONSTRAINT IF EXISTS notes_pkey;
    ALTER TABLE notes DROP COLUMN id;
    ALTER TABLE notes ADD PRIMARY KEY (user_id);
  END IF;
END $$;

-- dashboard_layout: widget positions are now per user per widget.
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM information_schema.key_column_usage
      WHERE table_name = 'dashboard_layout' AND constraint_name = 'dashboard_layout_pkey') = 1 THEN
    ALTER TABLE dashboard_layout DROP CONSTRAINT dashboard_layout_pkey;
    ALTER TABLE dashboard_layout ADD PRIMARY KEY (user_id, widget_id);
  END IF;
END $$;

-- apple_health_logs: the sync route upserts on (user_id, date) now.
ALTER TABLE apple_health_logs DROP CONSTRAINT IF EXISTS apple_health_logs_date_key;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'apple_health_logs_user_date_key') THEN
    ALTER TABLE apple_health_logs ADD CONSTRAINT apple_health_logs_user_date_key UNIQUE (user_id, date);
  END IF;
END $$;
