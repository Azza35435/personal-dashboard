-- Rotating habit periods: habits can be tagged to a time-of-day window so the
-- dashboard HabitsWidget can show only the relevant set (Morning/Afternoon/
-- Evening) instead of every active habit at once. Run after 007. Safe to re-run.

ALTER TABLE habits ADD COLUMN IF NOT EXISTS period TEXT NOT NULL DEFAULT 'anytime';
-- period ∈ 'morning' | 'afternoon' | 'evening' | 'anytime'
-- 'anytime' shows in every period — the default keeps existing habits visible
-- everywhere until Aaron assigns them a real period.
