-- Planner: private per-user time-blocking (day/week planning page).
-- Run after 006. Safe to re-run.

CREATE TABLE IF NOT EXISTS planner_routines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  start_min INTEGER NOT NULL,     -- minutes from midnight
  duration_min INTEGER NOT NULL DEFAULT 30,
  days INTEGER[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}', -- 0=Mon … 6=Sun
  color TEXT NOT NULL DEFAULT 'violet',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE planner_routines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own rows" ON planner_routines;
CREATE POLICY "Own rows" ON planner_routines
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS planner_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  start_min INTEGER NOT NULL,     -- minutes from midnight
  end_min INTEGER NOT NULL,
  title TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'blue',
  note TEXT,
  done BOOLEAN NOT NULL DEFAULT false,
  todo_id UUID REFERENCES todos(id) ON DELETE SET NULL,          -- linked-todo block
  routine_id UUID REFERENCES planner_routines(id) ON DELETE CASCADE, -- routine override for this date
  hidden BOOLEAN NOT NULL DEFAULT false,  -- routine skipped for this date
  suggested BOOLEAN NOT NULL DEFAULT false, -- future AI-draft flag (unused in v1 UI)
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS planner_blocks_user_date_idx ON planner_blocks (user_id, date);
ALTER TABLE planner_blocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own rows" ON planner_blocks;
CREATE POLICY "Own rows" ON planner_blocks
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
