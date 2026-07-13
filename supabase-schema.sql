-- Run this SQL in your Supabase dashboard (SQL Editor)
--
-- NOTE: this file is the single-user BASE schema (open "Allow all" RLS,
-- no user_id columns). The multi-account layer lives in migrations/ and
-- must be run afterwards, in order:
--   001-auth-foundation.sql  profiles, allowed_users invite gate
--   002-per-user-data.sql    user_id + per-user RLS on every table below
--   003-sidebar-prefs.sql    sidebar_prefs (replaces sidebar_order)

CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('checking','savings','cash','owed')),
  group_name TEXT NOT NULL DEFAULT 'personal',
  balance DECIMAL(12,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE income_streams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('freelance','swimming','investments','centrelink')),
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  destination TEXT NOT NULL DEFAULT 'personal',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  project TEXT,
  due_date DATE,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  completed BOOLEAN DEFAULT FALSE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE notes (
  id INTEGER PRIMARY KEY DEFAULT 1,
  content TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE habits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE habit_completions (
  habit_id UUID REFERENCES habits(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  PRIMARY KEY (habit_id, date)
);

CREATE TABLE nutrition_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_name TEXT NOT NULL,
  calories INTEGER DEFAULT 0,
  protein DECIMAL(6,1) DEFAULT 0,
  carbs DECIMAL(6,1) DEFAULT 0,
  fat DECIMAL(6,1) DEFAULT 0,
  date DATE DEFAULT CURRENT_DATE,
  logged_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE todo_sections (
  todo_id UUID REFERENCES todos(id) ON DELETE CASCADE,
  section_id UUID REFERENCES sections(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (todo_id, section_id)
);

CREATE TABLE gym_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  workout_type TEXT NOT NULL,
  duration_minutes INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE gym_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES gym_sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sets INTEGER,
  reps INTEGER,
  weight_kg DECIMAL(6,2),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE cookbook_recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'dinner' CHECK (category IN ('breakfast','lunch','dinner','snack')),
  tried BOOLEAN NOT NULL DEFAULT false,
  ingredients TEXT,
  calories INTEGER DEFAULT 0,
  protein DECIMAL(6,1) DEFAULT 0,
  carbs DECIMAL(6,1) DEFAULT 0,
  fat DECIMAL(6,1) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE curriculars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- curricular_id links a section to its parent curricular (nullable, one-to-one)
ALTER TABLE sections ADD COLUMN IF NOT EXISTS curricular_id UUID REFERENCES curriculars(id) ON DELETE SET NULL;

CREATE TABLE curricular_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curricular_id UUID NOT NULL REFERENCES curriculars(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  unit TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE curricular_notes (
  curricular_id UUID PRIMARY KEY REFERENCES curriculars(id) ON DELETE CASCADE,
  content TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE curricular_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curricular_id UUID NOT NULL REFERENCES curriculars(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (open for now, tighten later when you add auth)
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE income_streams ENABLE ROW LEVEL SECURITY;
ALTER TABLE todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE habit_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE nutrition_logs ENABLE ROW LEVEL SECURITY;

-- Allow all operations for anon key (personal use - no multi-user auth needed)
CREATE POLICY "Allow all" ON accounts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON income_streams FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON todos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON notes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON habits FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON habit_completions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON nutrition_logs FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE todo_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON sections FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON todo_sections FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE gym_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym_exercises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON gym_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON gym_exercises FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE curriculars ENABLE ROW LEVEL SECURITY;
ALTER TABLE curricular_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE curricular_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE curricular_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE cookbook_recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON cookbook_recipes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON curriculars FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON curricular_metrics FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON curricular_notes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON curricular_links FOR ALL USING (true) WITH CHECK (true);

-- Goals tables
CREATE TABLE IF NOT EXISTS goal_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO goal_categories (name, position) VALUES
  ('Recreational', 0), ('Finance', 1), ('Career', 2), ('Health', 3)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  category_id UUID REFERENCES goal_categories(id) ON DELETE SET NULL,
  horizon TEXT NOT NULL DEFAULT 'short',
  target_date DATE,
  notes TEXT,
  month TEXT,
  completed BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS goal_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS goal_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE goal_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON goal_categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON goals FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON goal_milestones FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON goal_decisions FOR ALL USING (true) WITH CHECK (true);

-- Shopping Waitlist (added for /shopping page):
CREATE TABLE IF NOT EXISTS shopping_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  search_query TEXT,
  woolworths_url TEXT,
  coles_url TEXT,
  chemist_url TEXT,
  alert_type TEXT NOT NULL DEFAULT 'any',
  alert_value DECIMAL(10,2),
  status TEXT NOT NULL DEFAULT 'watching',
  on_sale_now BOOLEAN NOT NULL DEFAULT false,
  last_sale_detected_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shopping_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES shopping_items(id) ON DELETE CASCADE,
  store TEXT NOT NULL,
  product_name TEXT,
  product_url TEXT,
  price DECIMAL(10,2),
  was_price DECIMAL(10,2),
  on_special BOOLEAN NOT NULL DEFAULT false,
  checked_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE shopping_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON shopping_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON shopping_prices FOR ALL USING (true) WITH CHECK (true);

-- Sidebar nav custom order (drag-to-reorder sidebar)
CREATE TABLE IF NOT EXISTS sidebar_order (
  href TEXT PRIMARY KEY,
  position INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE sidebar_order ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON sidebar_order FOR ALL USING (true) WITH CHECK (true);

-- ── Tables created after this file was first written (previously only in
-- ── CLAUDE.md / created directly in the dashboard) ──────────────────────

CREATE TABLE IF NOT EXISTS habit_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE habit_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON habit_groups FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS gym_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  workout_type TEXT NOT NULL,
  color TEXT DEFAULT 'blue',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS gym_template_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES gym_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sets INTEGER,
  reps INTEGER,
  weight_kg DECIMAL(6,2),
  position INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE gym_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym_template_exercises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON gym_templates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON gym_template_exercises FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS curricular_deadlines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curricular_id UUID NOT NULL REFERENCES curriculars(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  module TEXT,
  due_date DATE NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium',
  completed BOOLEAN NOT NULL DEFAULT false,
  todo_id UUID REFERENCES todos(id) ON DELETE SET NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE curricular_deadlines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON curricular_deadlines FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  billing_cycle TEXT NOT NULL DEFAULT 'monthly',
  next_payment_date DATE,
  category TEXT NOT NULL DEFAULT 'personal',
  curricular_id UUID REFERENCES curriculars(id) ON DELETE SET NULL,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  payment_type TEXT NOT NULL DEFAULT 'subscription',
  is_recurring BOOLEAN NOT NULL DEFAULT true,
  paid BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON subscriptions FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS dashboard_layout (
  widget_id TEXT PRIMARY KEY,
  x INTEGER NOT NULL DEFAULT 0,
  y INTEGER NOT NULL DEFAULT 0,
  w INTEGER NOT NULL DEFAULT 4,
  h INTEGER NOT NULL DEFAULT 4,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE dashboard_layout ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON dashboard_layout FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS apple_health_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  steps INTEGER,
  active_energy_kcal DECIMAL(8,2),
  resting_hr DECIMAL(5,2),
  hrv_ms DECIMAL(6,2),
  sleep_total_min INTEGER,
  sleep_deep_min INTEGER,
  sleep_rem_min INTEGER,
  sleep_core_min INTEGER,
  sleep_awake_min INTEGER,
  blood_oxygen_pct DECIMAL(5,2),
  respiratory_rate DECIMAL(5,2),
  vo2_max DECIMAL(5,2),
  exercise_min INTEGER,
  stand_hours INTEGER,
  weight_kg DECIMAL(6,2),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE apple_health_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON apple_health_logs FOR ALL USING (true) WITH CHECK (true);
