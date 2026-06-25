# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Important: Next.js Version

This project uses **Next.js 16**, which has breaking changes from earlier versions. Before modifying routing, middleware, or config, read the relevant guide in `node_modules/next/dist/docs/`.

## Commands

```bash
npm run dev       # Start dev server at localhost:3000
npm run build     # Production build (also validates types via Turbopack)
npm run start     # Serve production build
npm run lint      # ESLint
npx tsc --noEmit  # Type-check without building
```

No test suite is configured yet.

## Architecture

**Two main entry points:**

- **`app/page.tsx`** — Home dashboard: bento-grid layout using `react-grid-layout` v2.2.3. Five widgets (Hero, Quote, Today's Schedule, Habits, Priority Todos) arranged in a drag-resizable grid. Layout persisted to Supabase `dashboard_layout` table. Widget components live in `components/dashboard/`.
- **`app/schedule/page.tsx`** — Schedule & Tasks: the original home layout with `WeekCalendar` + `TodoWidget` sidebar.

All widgets are loaded via `dynamic(..., { ssr: false })` to prevent Supabase client instantiation during server-side prerendering.

### Data flow

- **Supabase** (`lib/supabase.ts`): single shared client, initialized from `NEXT_PUBLIC_SUPABASE_*` env vars. Every widget fetches and mutates its own table directly — there is no global state or context. Pattern is: `useEffect` → `supabase.from(...).select(...)`, re-fetch after every mutation via a local `load()` function.
- **Google Calendar**: `next-auth` v4 with Google provider stores `accessToken` in the JWT/session. The `/api/calendar` route uses `getServerSession(authOptions)` to retrieve it and proxies calls to the Google Calendar API. `authOptions` is exported from the auth route and imported by the calendar route. The auth route requests `calendar.readonly` scope with `access_type: offline` and `prompt: consent`. Expired tokens are automatically refreshed via the stored `refreshToken` in the JWT callback.
- **Session**: `SessionProviderWrapper` (a thin `'use client'` wrapper around NextAuth's `SessionProvider`) is mounted in `app/layout.tsx` so `useSession()` works in all widgets.

### Widget structure

Each widget in `components/widgets/` is self-contained: it owns its loading state, its Supabase queries, and its inline add/edit/delete UI. There is no shared widget state or prop drilling. Widgets follow a consistent pattern:
- `loading` state with skeleton placeholders (`animate-pulse`)
- Inline forms (toggled by local `adding` state) rather than modals
- Click-to-edit for numeric values (balance, income amounts)
- `group` + `group-hover:opacity-*` Tailwind pattern for contextual delete buttons

#### TodoWidget (`components/widgets/TodoWidget.tsx`)

- **Two views**: "priority" (todos grouped high/medium/low) and "sections" (todos grouped by section)
- **Drag-and-drop**: pointer-event based (not HTML5 drag API). Both todo items and sections are reorderable. Uses `onPointerDown` on cards + `pointermove`/`pointerup` on `window`. A gap spacer `<div>` is injected at `overIndex` to show the drop target. Captured `items` array in `DragState` / `capturedSections` in `SectionDragState` prevents stale-closure bugs in `commitDrop`. Effect dependency is `[!!dragging]` (boolean coercion) so it only re-subscribes on drag start/end, not every x/y update.
- **Section colors**: each section has an optional hex `color`. Cards in priority view use the first section's color; cards in sections view use their group's color. Applied via `toRgba(color, 0.3)` fill + `toRgba(color, 0.5)` border.
- **Edit popover**: `···` button on every card opens a fixed-position popover (anchored to button position via `getBoundingClientRect`) for editing title, priority, due date, and section membership. All interactive children (checkbox, delete, color picker, `···`) call `e.stopPropagation()` on `onPointerDown` to prevent drag hijacking.
- **`renderGroup()`**: builds node array with gap spacer injected at `gapAt` index. Parent container uses `flex flex-col gap-1.5` (not `space-y`) so gap sizing works correctly during drag.
- **Section drag**: uses `data-section-index` on section wrapper divs so `elementsFromPoint` finds the target even when the cursor is over child todo items. Section position is persisted to Supabase `sections.position` on drop.

#### GymWidget (`components/widgets/GymWidget.tsx`)

- **Three views**: "Month" (default, mini monthly calendar), "Week" (Mon–Sun), "All" (last 50 sessions). Tab strip in header.
- **Month view**: calendar grid, Mon–Sun columns. Each day cell: day number with green/orange nutrition tint (see below) + 5px coloured stripe at bottom = session colour. Click a session day → slide-in detail panel below grid. Click empty day → slide-in add-session form pre-filled with that date. Month `‹/›` navigation; forward disabled at `monthOffset >= 0`.
- **Nutrition overlay** (month only): fetches `nutrition_logs` for the month + reads `nutrition_targets` from `localStorage`. Green tint = calories ≥ target AND protein ≥ target; orange = food logged but targets missed; no tint = nothing logged. Legend shown below grid.
- **Session colour**: per-session `color` field in `gym_sessions` (one of: blue/violet/rose/orange/emerald/amber/teal/slate). Shown as bottom stripe (month) or coloured left border on session cards (week/all). Colour picker appears in add-session form.
- **Templates**: any session can be saved as a named template ("Save template" button). Stored in `gym_templates` + `gym_template_exercises`. "Load template →" in add-session form pre-fills workout_type + colour + auto-inserts exercises after save. Template list supports delete.
- **Slide-in panel** (month): coloured left stripe, workout type, date/duration, full exercise list (sets×reps weight), "Save template" + "Delete", inline "+ Add exercise" form.
- **Week/All session cards**: coloured left border (3px). Hover shows "template" and "×". Expand for exercise list.
- **Accent colour picker**: ⚙ gear icon → swatch panel for widget border only. `localStorage` key `gym_widget_border`. Default `border-l-blue-400`.
- **Exercise drag-and-drop**: pointer-event based (same pattern as TodoWidget). Three drag contexts, all using `elementsFromPoint` with `data-*` attributes and `[!!dragging]` effect dependency with a ref to avoid stale closures:
  - **Outer drag** (`exDragging`): `⠿` handle on each `ExListItem` (solo exercise or superset group). Reorders at the group level; persists via sequential `position` updates. Blue dashed gap spacer at `overIndex`; dragged item goes `opacity-30`. Drop zone `div` at end of list enables "append to bottom".
  - **Intra-superset drag** (`superDragging`): `⠿` handle on each exercise inside a superset (`data-intra-ex-index`, `data-intra-group-id`). Reorders within the group by reassigning the group's existing position slots. Drag-out: once cursor leaves the superset container (`data-superset-group` not in `elementsFromPoint`), `outerOverIndex` activates and a gap appears in the outer list. On drop, the exercise detaches (`superset_group = null`), is inserted at the outer position, and the group dissolves if only one exercise remains.
  - **Join superset** (via `exDragging`): when dragging a solo exercise over a superset's content area (`data-superset-group`), `hoverGroupId` is set and the superset highlights with `ring-2 ring-blue-400`. Dropping updates `superset_group` to join. Does not trigger when dragging a superset group (only solo → superset).
- **`load`/`loadMonthNutrition`** as `useCallback`: both depend on `view` + respective offsets. `loadMonthNutrition` no-ops when not in month view.

#### NutritionWidget (`components/widgets/NutritionWidget.tsx`)

- **Date navigation**: `dateOffset` state (0 = today, -1 = yesterday, …) with ‹/› arrows. Forward arrow disabled at `dateOffset >= 0`.
- **Daily targets**: calories + protein + carbs + fat targets stored in `localStorage` under key `nutrition_targets`. Editable via "Targets" button which opens an inline form.
- **Progress bars**: each macro tile shows a thin progress bar (`h-1`) and `/ target` label. Bar turns `bg-red-300` when the total exceeds the target.
- **`load` as `useCallback`**: depends on `dateOffset`; `useEffect` runs on `[load]`.

#### CookbookWidget (`components/widgets/CookbookWidget.tsx`)

- **Location**: third column on the Health page (`w-72`, amber theme), alongside Gym and Nutrition.
- **Recipe fields**: name, category (breakfast/lunch/dinner/snack), tried/untried, ingredients (freetext), macros (calories/protein/carbs/fat), notes.
- **Filtering**: search bar (by name), category filter chips, "Untried only" toggle.
- **Expand/collapse**: clicking a recipe card reveals ingredients, macros grid, notes, and a "Log to today" button.
- **Log to today**: inserts the recipe's macros into `nutrition_logs` for today's date — same insert pattern as NutritionWidget's `addLog`.
- **Tried toggle**: circular checkbox on each card flips `tried` in Supabase without opening the card.
- **`load` as `useCallback`**: no dependencies; called once on mount and after every mutation.

#### HabitTracker (`components/widgets/HabitTracker.tsx`)

Full-page Excel-style monthly habit tracker at `/habits`. Uses **Recharts** (installed v3) for line charts.

**Three-row layout:**
- **Row 1**: Month nav (‹/›, disabled at current month) | Two line charts side-by-side (daily completion % this month + 12-month trend) | Monthly % donut ring (SVG, violet).
- **Row 2**: Three-column panel in a single card:
  - *Col 1 (200px)*: Group headers + habit rows with `⠿` drag handles + `···` popovers + per-group inline add forms + "Add group" button at bottom.
  - *Col 2 (flex-1)*: Horizontally scrollable checkbox grid (habits as rows, days 1–31 as columns, `CELL_W=30px`). Group header rows mirror Col 1. Today's column highlighted. Below grid: bar chart (height proportional to daily completion count) + `%` fill strip + text % per day. Bars are full violet when 100%, partial violet when some done, gray when none.
  - *Col 3 (184px)*: Horizontal progress bars per habit + group average label. Mirrors Col 1 row-for-row.
- **Row 3**: Weekly donut rings (one per calendar week of the month, Mon–Sun split).

**Groups**: Habits belong to named groups (`habit_groups` table) via `habits.group_id`. A permanent virtual "General" group catches ungrouped habits (`group_id = null`). `sections` flat array = ordered named groups + General sentinel — iterated identically in all three columns for alignment. `GRP_H = 26` for group header rows, `ROW_H = 36` for habit rows, `HDR_H = 30` for column headers. `GENERAL_ATTR = '__general__'` sentinel serialises `null` group_id in data attributes via `gAttr()`/`attrToG()` helpers.

**Two drag systems** (pointer-event based, `[!!dragging]` effect dep, ref to avoid stale closures):
- **Habit drag** (`habitDrag`/`habitDragRef`): `data-hdrop-gid` + `data-hdrop-idx` on every habit row in all 3 columns. Supports cross-group drops — removes from source group, inserts at dest at `overIndex`, persists `position` + `group_id`.
- **Group drag** (`groupDrag`/`groupDragRef`): `⠿` on group header rows in Col 1. `data-gdrop-idx` on headers. Reorders named groups only; persists `position` to `habit_groups`.

**Popovers**: `···` on habit rows → group picker (immediate reassign) + delete. `···` on group headers → rename input + delete. Delete group with habits → move-or-delete confirmation (`DeleteConfirm` state) with destination picker + "Also delete all habits" checkbox.

**Data**: `habit_groups` (ordered by position) + `habits` (active, ordered by position then created_at) + `habit_completions` for the viewed month. Completions keyed as `${habit_id}:${day}`. Multi-month trend loaded separately on mount. `load` depends on `[startDate, endDate]`.

**Home dashboard widget** (`components/dashboard/HabitsWidget.tsx`): Today's checkboxes + small monthly % donut + "Full tracker →" link to `/habits`.

#### CurricularsWidget (`components/widgets/CurricularsWidget.tsx`)

- **Purpose**: tracks life areas / co-curriculars (e.g. New Property Group, D Swimming). Lives at `/curriculars`.
- **Tab bar**: each curricular is a tab. Switching tabs auto-saves the current note before loading the new curricular's content.
- **Todo link**: each curricular can be linked to exactly one todo section via `sections.curricular_id`. Todos from that section appear in the curricular's Tasks panel. Adding a todo in the curricular view inserts it into the linked section — it also appears in the TodoWidget's sections view. When adding a new curricular you choose "Create new section" (creates a fresh section) or "Link existing section" (picks from unlinked sections). Deleting a curricular unlinks (does not delete) its section.
- **Metrics**: editable key-value pairs per curricular (`curricular_metrics` table). Unit can be `$`, `hrs`, or none. Click a value to edit inline.
- **Notes**: single auto-saving textarea per curricular (`curricular_notes` table, `curricular_id` is PK). Saves on blur and on tab change.
- **Links**: list of (title, URL) pairs (`curricular_links` table). URLs auto-prefixed with `https://` if missing.
- **`load` as `useCallback`**: depends on `selectedId`; the `useEffect` depends on `load`, so switching tabs automatically triggers a re-fetch.

#### WeekCalendar (`components/widgets/WeekCalendar.tsx`)

- Shows events from **all Google Calendars** (not just primary) by first fetching `calendarList` then parallel-fetching events per calendar in `/api/calendar`.
- Auto-refreshes events every 5 minutes when viewing the current week.
- `fetchEvents` is an extracted named function so it can be called by both the `useEffect` on session/weekOffset change and the auto-refresh interval.
- Shows a "Disconnect" button when authenticated to allow signing out and re-authenticating (needed if scope changes).
- **Error surfacing**: `calError` state captures any non-array API response and displays a red banner above the grid. Errors were previously silent (empty calendar with no indication of failure).

### Dashboard widgets (`components/dashboard/`)

Five lightweight widgets for the home bento-grid dashboard (`app/page.tsx`):

- **`HeroWidget`**: Live ticking clock (1s interval), greeting by hour (Good morning/afternoon/evening/night), Melbourne location. Violet gradient background.
- **`QuoteWidget`**: 36 curated quotes, one per day (`getDayOfYear % 36`). Amber gradient. No external API.
- **`HabitsWidget`**: Today's habit checkboxes + monthly % donut ring (computed from month-to-date completions). Links to `/habits` full tracker.
- **`TodayScheduleWidget`**: Fetches `/api/calendar` for today's date range. Shows unauthenticated state with "Connect Calendar" button. Uses `useSession` from next-auth.
- **`PriorityTodosWidget`**: Todos where `priority = 'high'` OR `due_date = today`, not completed. Toggle-complete removes from list. Shows due-date badge.

Each widget is a self-contained card with `rounded-2xl shadow` styling, `overflow-hidden`, and `flex flex-col` for header + scrollable body.

The bento grid in `app/page.tsx`:
- Uses `react-grid-layout` v2 (`GridLayout` default export). In v2, `cols`/`rowHeight`/`margin` go in `gridConfig`, `draggableHandle` goes in `dragConfig.handle`, `resizeHandles` goes in `resizeConfig.handles`.
- Layout persisted to `dashboard_layout` Supabase table (debounced 800ms on `onLayoutChange`).
- Container width measured via `ResizeObserver` on the outer `flex-1` div (NOT an inner wrapper) → passed as `width` prop. Must be on the flex item itself to get the correct available width.
- Drag handle: `.drag-handle` strip at top of each `WidgetShell`.
- CSS for react-grid-layout is inlined in `app/globals.css` (not imported from node_modules).

### Google Calendar auth setup checklist

Common failure modes and their fixes (all must be true for sign-in to work):

1. **`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` set in Vercel** — missing env vars cause immediate Google rejection with no account chooser. Verify at `/api/debug-auth`.
2. **Authorized redirect URI in Google Cloud Console** — must include exactly `https://<your-domain>/api/auth/callback/google`. Mismatch shows `Error 400: redirect_uri_mismatch`. Must be the **stable production URL**, not a preview deployment URL.
3. **`calendar.readonly` scope added to OAuth consent screen** — must be explicitly added under "Scopes" in the consent screen editor, not just in code.
4. **Google Calendar API enabled** — APIs & Services → Enabled APIs → Google Calendar API.
5. **Test user email added and saved** — in OAuth consent screen → Test users, type email then press Enter before clicking Save.
6. **`NEXTAUTH_URL` set to stable production URL** — not a preview deployment URL.
7. **Stale token / "Failed to fetch calendar list"** — if the calendar shows this error after signing in, the session token was issued before scopes were fully configured. Fix: click **Disconnect** in the calendar widget, then sign in again. The `prompt: consent` in `authOptions` forces Google to re-issue a fresh token with all current scopes.
8. **403 insufficient scopes after reconnecting / app not in Google permissions** — the NextAuth JWT cookie persists the old token even after "Disconnect". Full fix: (a) clear all cookies for the Vercel domain in browser DevTools → Application → Cookies, OR go to `https://myaccount.google.com/permissions`, find the app and click **Remove Access**, then sign in fresh. Simply clicking Disconnect in the widget is not enough when the token is deeply stale or was issued without the calendar scope.

Debug endpoint: `GET /api/debug-auth` returns which env vars are set and the exact `redirect_uri` being sent to Google.
Custom error page: `app/auth/error/page.tsx` shows the actual NextAuth error code (configured via `pages: { error: '/auth/error' }` in `authOptions`).
Calendar API error messages include the HTTP status and Google's response body (e.g. `Failed to fetch calendar list (401): Invalid Credentials`).

### Shared utilities

- `lib/types.ts` — all TypeScript interfaces (`Account`, `Todo`, `Habit`, `Section`, etc.) and union types (`AccountType`, `AccountGroup`, `IncomeCategory`, `Priority`)
- `lib/utils.ts` — `cn()` (clsx + tailwind-merge), `formatCurrency()` (AUD, `en-AU`), `formatDate()`, `formatTime()`, `isToday()`, `isPast()`
- `types/next-auth.d.ts` — module augmentation to add `accessToken?: string` to the `Session` type

### Styling

Tailwind v4 (CSS-first config via `@import "tailwindcss"` in `globals.css`).

**Design system (light minimal, as of 2026-06-25):**
- Widget outer: `bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded shadow-sm` + `border-l-2 border-l-{accent}` per widget area
- Inner cards/panels: `bg-gray-50 dark:bg-gray-800 rounded border border-gray-100 dark:border-gray-700`
- Inputs: `bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded placeholder-gray-400`
- Primary buttons: `bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded`
- Section labels: `text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500`
- Color use: **semantic only** — red = danger/over-budget, green = done, yellow = warning. No decorative color.
- Left border accent (2px) per widget area identifies each widget type. Accents: emerald=NetWorth, teal=Accounts, amber=Income/Cookbook, blue=Gym/Nutrition, violet=Habits/Curriculars, slate=Notes, rose=Todo.
- **Dashboard page exception**: `app/page.tsx` uses its own soft gradient background (`from-[#faf9f7] to-[#f0edf8]` light / `from-gray-950 to-[#1a1525]` dark) instead of the `BackgroundTheme` body background. Dashboard widget cards use `rounded-2xl shadow-[0_2px_16px_rgba(0,0,0,0.06)]` for a softer Dribbble-inspired look.

**Background**: `BackgroundTheme.tsx` shifts the body background from near-black at night to near-white during the day (Melbourne sunrise/sunset). It also adds/removes the `dark` class on `<html>`, so all `dark:` Tailwind variants respond automatically. (The `/` dashboard overrides this with its own gradient.)

**UI history**: Previous designs are saved in `ui-snapshots/`. The original colorful bubble design is at `ui-snapshots/2026-06-22-colorful-bubbles/` with a README explaining how to restore it.

### Database schema

Seventeen Supabase tables: `accounts`, `income_streams`, `todos`, `notes` (single row, id=1, upserted), `habits`, `habit_completions`, `sections`, `todo_sections`, `nutrition_logs`, `gym_sessions`, `gym_exercises`, `curriculars`, `curricular_metrics`, `curricular_notes`, `curricular_links`, `cookbook_recipes`, `dashboard_layout`. Schema SQL is in `supabase-schema.sql`. RLS is enabled with open `"Allow all"` policies (single-user personal app).

**`habits`** has `position INTEGER NOT NULL DEFAULT 0` and `group_id UUID` columns. **`habit_groups`** table stores named groups. Run these migrations if not already applied:
```sql
ALTER TABLE habits ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;
ALTER TABLE habits ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES habit_groups(id) ON DELETE SET NULL;
CREATE TABLE IF NOT EXISTS habit_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE habit_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON habit_groups FOR ALL USING (true) WITH CHECK (true);
```

**`dashboard_layout`**: stores bento-grid widget positions for `app/page.tsx`. One row per widget, upserted on drag/resize. Migration SQL:
```sql
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
```

- `todos` has a `position INTEGER NOT NULL DEFAULT 0` column for drag-and-drop ordering within priority groups and unsectioned lists.
- `sections` has `color TEXT` (nullable hex string, e.g. `#3b82f6`) and `position INTEGER NOT NULL DEFAULT 0` for drag-to-reorder.
- `todo_sections` is a many-to-many junction between todos and sections (todo_id, section_id, position) — `position` drives per-section drag-and-drop order. Both cascade-delete on parent row removal.

**`sections`** has a nullable `curricular_id UUID` column (FK to `curriculars.id`, `ON DELETE SET NULL`) that links a section to its parent curricular.

**If setting up from scratch**, run `supabase-schema.sql` in the Supabase SQL editor. If migrating an existing DB, also run:
```sql
ALTER TABLE todos ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sections ADD COLUMN IF NOT EXISTS color TEXT;
-- Gym tables (added for Health page):
CREATE TABLE IF NOT EXISTS gym_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  workout_type TEXT NOT NULL,
  duration_minutes INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS gym_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES gym_sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sets INTEGER,
  reps INTEGER,
  weight_kg DECIMAL(6,2),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE gym_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym_exercises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON gym_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON gym_exercises FOR ALL USING (true) WITH CHECK (true);
-- Gym session colour + templates (added for monthly calendar view):
ALTER TABLE gym_sessions ADD COLUMN IF NOT EXISTS color TEXT DEFAULT 'blue';
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
-- Curriculars tables (added for /curriculars page):
ALTER TABLE sections ADD COLUMN IF NOT EXISTS curricular_id UUID REFERENCES curriculars(id) ON DELETE SET NULL;
CREATE TABLE IF NOT EXISTS curriculars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS curricular_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curricular_id UUID NOT NULL REFERENCES curriculars(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  unit TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS curricular_notes (
  curricular_id UUID PRIMARY KEY REFERENCES curriculars(id) ON DELETE CASCADE,
  content TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS curricular_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curricular_id UUID NOT NULL REFERENCES curriculars(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE curriculars ENABLE ROW LEVEL SECURITY;
ALTER TABLE curricular_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE curricular_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE curricular_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON curriculars FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON curricular_metrics FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON curricular_notes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON curricular_links FOR ALL USING (true) WITH CHECK (true);
```

## Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
NEXTAUTH_URL=https://<your-vercel-domain>   # e.g. https://personal-dashboard-sooty-eight.vercel.app
NEXTAUTH_SECRET=        # openssl rand -base64 32
```

For Vercel deployment, add all six vars in the Vercel dashboard and add the Vercel URL as an authorized redirect URI in Google Cloud Console (`https://<your-domain>/api/auth/callback/google`). The Google OAuth app must have `https://www.googleapis.com/auth/calendar.readonly` scope enabled and the sign-in email added as a test user (while the app is in Testing mode).

**Important**: `NEXTAUTH_URL` must be set to the stable production URL (not a deployment-specific preview URL) on Vercel, otherwise OAuth redirect URIs won't match.
