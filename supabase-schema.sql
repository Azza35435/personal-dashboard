-- Run this SQL in your Supabase dashboard (SQL Editor)

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
