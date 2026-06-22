# UI Snapshot: Colorful Bubbles — 2026-06-22

## Description
Original design: solid saturated colored backgrounds per widget (emerald, teal, teal, amber, indigo, rose, sky, blue, green, amber, violet), white text, `bg-white/10` inner cards, `rounded-2xl` corners, `text-white` throughout.

## How to restore
Copy all files from this directory back to their original locations:

```bash
cp -r ui-snapshots/2026-06-22-colorful-bubbles/widgets/* components/widgets/
cp ui-snapshots/2026-06-22-colorful-bubbles/Sidebar.tsx components/Sidebar.tsx
cp ui-snapshots/2026-06-22-colorful-bubbles/BackgroundTheme.tsx components/BackgroundTheme.tsx
cp ui-snapshots/2026-06-22-colorful-bubbles/globals.css app/globals.css
```

## Widget colors at time of snapshot
- NetWorthWidget: `bg-emerald-500`
- AccountsWidget: `bg-teal-600`
- IncomeWidget: `bg-amber-500`
- GymWidget: user-selectable, default `bg-blue-600`
- NutritionWidget: `bg-green-600`
- CookbookWidget: `bg-amber-600`
- HabitWidget: `bg-indigo-600`
- TodoWidget: `bg-rose-500`
- NotesWidget: `bg-sky-500`
- CurricularsWidget: `bg-violet-600`
