# UI Snapshot: Light Minimal Bento — 2026-08-13

## Description
The dashboard design being replaced by the "editorial & elegant" reskin (Newsreader/Public Sans, warm paper background, oxblood + sage accents, hairline-ruled grid). This snapshot is the light-minimal bento-grid look: `bg-white dark:bg-gray-900` cards, `rounded-2xl` corners, `shadow-[0_2px_16px_rgba(0,0,0,0.06)]`, soft `from-[#faf9f7] to-[#f0edf8]` gradient page background, per-widget accent colors (violet Habits, rose priority-high, amber Goals, green on-sale, cyan Groceries), Hero/Quote widgets with colorful gradient fills. Drag/resize (`react-grid-layout`) and `dashboard_layout` persistence are unaffected by the reskin either way — this snapshot only covers visual styling.

## How to restore

```bash
cp ui-snapshots/2026-08-13-light-minimal-bento/page.tsx app/page.tsx
cp ui-snapshots/2026-08-13-light-minimal-bento/dashboard/*.tsx components/dashboard/
```

Note: if the editorial version has since added new `Habit.period` behavior (rotating Morning/Afternoon/Evening habit sets), restoring this snapshot's `HabitsWidget.tsx` reverts to the old single-list-of-today's-habits view — the `habits.period` column and `lib/habits.ts` helpers are additive to the schema/codebase and safe to leave in place either way (they just go unused by this older widget).

## Widget styling at time of snapshot
- Page background: `bg-gradient-to-br from-[#faf9f7] to-[#f0edf8] dark:from-gray-950 dark:to-[#1a1525]`
- HeroWidget: `bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700`, white text
- QuoteWidget: `bg-gradient-to-br from-amber-50 to-orange-50`, amber accents
- TodayScheduleWidget / PriorityTodosWidget / GoalsWidget / ShoppingWidget / GroceriesWidget: `bg-white dark:bg-gray-900 rounded-2xl shadow-[0_2px_16px_rgba(0,0,0,0.06)]` cards, row-per-item pill backgrounds (`bg-gray-50 dark:bg-gray-800 rounded-xl`)
- HabitsWidget: violet accent (`#7c3aed`), no period/time-of-day grouping — single flat list of all active habits
