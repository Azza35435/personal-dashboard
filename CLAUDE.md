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

**Main entry points:**

- **`app/page.tsx`** — Home dashboard: bento-grid layout using `react-grid-layout` v2.2.3. Seven widgets (Hero, Quote, Today's Schedule, Habits, Priority Todos, Goals, Shopping) arranged in a drag-resizable grid. Layout persisted to Supabase `dashboard_layout` table. Widget components live in `components/dashboard/`.
- **`app/schedule/page.tsx`** — Schedule & Tasks: the original home layout with `WeekCalendar` + `TodoWidget` sidebar.
- **`app/finance/page.tsx`** — Finance: NetWorthWidget + AccountsWidget + IncomeWidget in a 3-column grid, wrapped in `FinanceLock`. Below the grid (full-width `col-span-full`): `SubscriptionsWidget`.
- **`app/curriculars/page.tsx`** — Curriculars: CurricularsWidget with per-curricular tasks, deadlines, metrics, notes, links. Deadlines tab shows DeadlinesCalendar.
- **`app/deadlines/page.tsx`** — Standalone deadlines calendar (DeadlinesCalendar with no prop — fetches its own data). Linked from sidebar.
- **`app/habits/page.tsx`** — Full-page habit tracker (HabitTracker).
- **`app/health/page.tsx`** — Health: GymWidget + NutritionWidget + CookbookWidget + AppleHealthWidget.
- **`app/apple-health/page.tsx`** — Apple Health full tracker (AppleHealthTracker).
- **`app/goals/page.tsx`** — Goals tracker (GoalsWidget): monthly / short-term / long-term goals grouped by editable categories, with milestones and a decision journal.
- **`app/shopping/page.tsx`** — Shopping Waitlist (ShoppingWaitlistWidget): watched grocery/pharmacy items with per-item alert rules; "Check now" hits `/api/shopping/check` which scrapes store prices into `shopping_prices`.
- **`app/settings/page.tsx`** — Settings (SettingsWidget): tabbed — Sidebar customisation / Preferences (nutrition targets, Finance PIN) / Account (profile, sign out, calendar connection) / Admin (members & invites, admin only). See "Settings page" below.

**Sidebar nav** (`components/Sidebar.tsx`): Dashboard, Schedule & Tasks, Finance, Health, Apple Health, Habits, Goals, Shopping Waitlist, Notes, Curriculars, Deadlines. The Shopping Waitlist entry shows a green count badge of active sale alerts (fetched on every route change via `alertActive()` from `lib/shopping.ts`). Nav items are **drag-to-reorder** (pointer-event pattern, 6px movement threshold so plain clicks still navigate; `didDragRef` suppresses the Link click after a drag). Dashboard is pinned at index 0 and not draggable; drops are clamped to index ≥ 1. Per-user prefs persist to the `sidebar_prefs` table (PK `(user_id, href)`: position, `hidden`, `custom_label`); unknown/new NAV_ITEMS not in the table are appended in default order. The sidebar renders `custom_label ?? label` and filters out hidden items (drag operates on the visible list; hidden items keep their relative order at the end). Sidebar returns `null` on `/login`.

**Settings page** (`app/settings/page.tsx` → `components/widgets/SettingsWidget.tsx`): ⚙ Settings link pinned at the sidebar footer (not part of the reorderable list). Tabbed page — **Sidebar** (per tool: ⠿ drag-reorder *and* ↑/↓ arrows, ✎ inline rename shown as `custom (default)`, 👁/🚫 hide toggle; Dashboard row pinned with no controls; hidden pages stay reachable by URL; "Reset to defaults" deletes the user's `sidebar_prefs` rows), **Preferences** (nutrition targets — same `nutrition_targets` localStorage key the Nutrition/Gym widgets read; Finance PIN set/change/remove — same `finance_passcode_hash` localStorage sha256-hex scheme as FinanceLock), **Account** (profile + Sign out → `supabase.auth.signOut()`; Google Calendar connect/disconnect via NextAuth `useSession` until Phase 4), **Admin** (only when `profiles.is_admin`: member list from `profiles`, pending invites = `allowed_users` rows without a profile, invite by email inserts into `allowed_users` client-side, remove calls `DELETE /api/admin/members` — admin-checked route using `supabaseAdmin` that deletes the allowlist row and the auth user, cascading away their data).

**Sidebar↔settings sync** (`lib/sidebarPrefs.ts`): shared module owning `NAV_ITEMS`, `loadSidebarPrefs()`/`persistSidebarPrefs()`/`resetSidebarPrefs()` and a `sidebar-prefs-changed` window event — both Sidebar and the settings page persist through it and re-load on the event, so edits on `/settings` appear in the sidebar instantly (and sidebar drags update the settings page).

All widgets are loaded via `dynamic(..., { ssr: false })` to prevent Supabase client instantiation during server-side prerendering.

### Auth & multi-account (added 2026-07)

The app is multi-account: invite-only Google sign-in via **Supabase Auth**, per-user data enforced by RLS.

- **`lib/supabase.ts`**: `createBrowserClient` from `@supabase/ssr` — cookie-based session, so every widget query carries the user's JWT and `auth.uid()` works under RLS. Same `supabase` export as before; widgets are unchanged.
- **`lib/supabase-server.ts`** (server-only): `createRouteHandlerClient()` (cookie-aware, per-request) + `supabaseAdmin()` (service-role, bypasses RLS — for the price checker and health sync which run without a user session; requires `SUPABASE_SERVICE_ROLE_KEY`).
- **`proxy.ts`** (Next.js 16 renamed `middleware.ts` → `proxy.ts`, export `proxy`): refreshes the session cookie on every request and redirects signed-out visitors to `/login`. Public paths: `/login`, `/auth/*`, `/api/auth/*`, `/api/health-sync`, `/api/debug-auth`.
- **`app/login/page.tsx`**: Google sign-in button (`signInWithOAuth` → `/auth/callback` PKCE exchange in `app/auth/callback/route.ts`). Shows a friendly "not invited" state — Supabase surfaces the allowlist trigger's rejection as `Database error saving new user`.
- **Invite gate**: `allowed_users` table (email PK, `is_admin` flag) + an `AFTER INSERT` trigger on `auth.users` that raises unless the email is allowlisted, and auto-creates the `profiles` row (id = auth uid, email, display_name, avatar_url, is_admin copied from the invite).
- **RLS**: every data table has `user_id UUID NOT NULL DEFAULT auth.uid()` and an `"Own rows"` policy (`user_id = auth.uid()`), so widget inserts need no code changes. Service-role inserts **must stamp `user_id` explicitly** (the default evaluates to NULL without a session) — see the shopping check route and health-sync route.
- **Migrations** live in `migrations/` and must be run in order in the Supabase SQL editor: `001-auth-foundation.sql` (profiles/allowlist — run, then sign in once), `002-per-user-data.sql` (user_id + RLS on all tables, backfills to the owner by email lookup), `003-sidebar-prefs.sql` (per-user sidebar prefs, drops `sidebar_order`), `004-google-tokens.sql` (per-user Google Calendar tokens).
- **Table quirks after 002**: `notes` is one row per user (PK `user_id`, the old `id=1` column is gone); `dashboard_layout` PK is `(user_id, widget_id)`; `apple_health_logs` unique key is `(user_id, date)` — health-sync stamps the admin profile's id since the iOS shortcut authenticates with a shared secret.
- **NextAuth is fully retired** (Phase 4, 2026-07): one Google consent at sign-in covers both login and calendar. Nothing imports `next-auth`; there is no SessionProvider.

### Data flow

- **Supabase** (`lib/supabase.ts`): single shared browser client (see Auth section), initialized from `NEXT_PUBLIC_SUPABASE_*` env vars. Every widget fetches and mutates its own table directly — there is no global state or context. Pattern is: `useEffect` → `supabase.from(...).select(...)`, re-fetch after every mutation via a local `load()` function. RLS scopes all reads/writes to the signed-in user automatically.
- **Google Calendar** (per user, via Supabase provider tokens): sign-in (`app/login/page.tsx`) requests the `calendar.readonly` scope with `access_type: offline` + `prompt: consent`; `/auth/callback` stores the returned `provider_refresh_token` (+ initial `provider_token`) in the user's `google_tokens` row. `/api/calendar` identifies the caller via the cookie session, reads their `google_tokens` row (RLS: own row), refreshes the access token against `oauth2.googleapis.com/token` when expired (cached back into the row; `invalid_grant` deletes the row so the UI re-offers Connect), then fans out to `calendarList` + per-calendar events exactly as before. Client state lives in `lib/useCalendarConnection.ts` — `useCalendarConnection()` returns `{ status: loading|connected|disconnected, connected, connect, disconnect }` where connected = own `google_tokens` row exists, `connect()` re-runs `signInWithOAuth` with the calendar scope (redirect back via `?next=`), `disconnect()` deletes the row. Used by `WeekCalendar`, `TodayScheduleWidget`, and the Settings Account tab.

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

**Popovers**: `···` on habit rows → rename input + group picker (immediate reassign) + delete. `···` on group headers → rename input + delete. Delete group with habits → move-or-delete confirmation (`DeleteConfirm` state) with destination picker + "Also delete all habits" checkbox.

**Data**: `habit_groups` (ordered by position) + `habits` (active, ordered by position then created_at) + `habit_completions` for the viewed month. Completions keyed as `${habit_id}:${day}`. Multi-month trend loaded separately on mount. `load` depends on `[startDate, endDate]`.

**Home dashboard widget** (`components/dashboard/HabitsWidget.tsx`): Today's checkboxes + small monthly % donut + "Full tracker →" link to `/habits`.

#### CurricularsWidget (`components/widgets/CurricularsWidget.tsx`)

- **Purpose**: tracks life areas / co-curriculars (e.g. New Property Group, D Swimming). Lives at `/curriculars`.
- **Tab bar**: `📅 Deadlines` tab (sentinel `DEADLINES_TAB = '__deadlines__'`) always first, then one tab per curricular. Switching tabs auto-saves the current note before loading the new curricular's content.
- **Edit curricular**: ✎ Edit button in the Tasks section header → inline form to rename and change colour (colour picker circle). Saving also updates the linked section's colour.
- **Todo link**: each curricular can be linked to exactly one todo section via `sections.curricular_id`. Todos from that section appear in the curricular's Tasks panel. Adding a todo in the curricular view inserts it into the linked section — it also appears in the TodoWidget's sections view. When adding a new curricular you choose "Create new section" (creates a fresh section) or "Link existing section" (picks from unlinked sections). Deleting a curricular unlinks (does not delete) its section.
- **Deadlines**: per-curricular deadlines (`curricular_deadlines` table). Each deadline has title, module label, due date, priority. Adding a deadline auto-creates a linked todo in the curricular's section (if linked) — `todo_id` stored on the deadline row. Toggling/deleting a deadline syncs the linked todo. Past deadlines show red bg; completed ones stay greyed out.
- **Deadlines tab**: when `selectedId === DEADLINES_TAB`, renders `<DeadlinesCalendar curriculars={curriculars} />` (holistic view across all curriculars).
- **Metrics**: editable key-value pairs per curricular (`curricular_metrics` table). Unit can be `$`, `hrs`, or none. Click a value to edit inline.
- **Notes**: single auto-saving textarea per curricular (`curricular_notes` table, `curricular_id` is PK). Saves on blur and on tab change.
- **Links**: list of (title, URL) pairs (`curricular_links` table). URLs auto-prefixed with `https://` if missing.
- **`load` as `useCallback`**: depends on `selectedId`; the `useEffect` depends on `load`, so switching tabs automatically triggers a re-fetch.

#### DeadlinesCalendar (`components/widgets/DeadlinesCalendar.tsx`)

- **Shared component** used in two places: embedded in CurricularsWidget's Deadlines tab (receives `curriculars` prop) and standalone at `/deadlines` (fetches its own curriculars).
- **Two views**: `agenda` (default) and `month`. Toggle in header.
- **Agenda view**: groups = Overdue (red), This week (violet), Next week (gray), Later (gray), Completed (gray). Each group shows count.
- **Month view**: calendar grid Mon–Sun, day cells show up to 2 coloured chips (curricular colour + 33% opacity bg), `+N` overflow. Click day → selected day detail panel below grid. Month ‹/› nav; forward disabled at `monthOffset >= 0`. Today: violet circle on date number.
- **DeadlineChip**: curricular colour dot, title, module, priority dot (red/amber/green), date. Past = red border; completed = grey + strikethrough.
- **Props**: `curriculars?: Curricular[]` — if provided, uses them directly; otherwise fetches from Supabase.

#### IncomeWidget (`components/widgets/IncomeWidget.tsx`)

- **Billing cycles**: supports `monthly` and `fortnightly`. Toggle shown in add form and edit mode.
- **Monthly total**: fortnightly amounts converted via `amount × 26 / 12`. Header shows total `/mo` and `/fn` (fortnightly equivalent). Each fortnightly stream shows entered amount `/fn` + monthly equivalent below.
- **`billing_cycle`** column required on `income_streams` table (`TEXT NOT NULL DEFAULT 'monthly'`).

#### SubscriptionsWidget (`components/widgets/SubscriptionsWidget.tsx`)

- **Location**: full-width row below NetWorth/Accounts/Income on `/finance` page (`col-span-full` in the FinanceLock grid).
- **Widget renamed** to "Payments" in the UI.
- **Two payment types**:
  - `subscription` (🔄) — auto-charged. Shows next payment date with urgency colouring (red ≤3 days, amber ≤7).
  - `manual` (✋) — user must action. Same urgency colouring. Has a green ✓ "Mark paid" button on hover.
- **Manual payment sub-types**: `is_recurring` (Recurring vs One-off).
  - **Recurring manual** (e.g. car rego): ✓ Mark paid → inline confirm-next-date prompt pre-filled via `advanceDate()` (adds 1 cycle). User can adjust before confirming. Saves updated `next_payment_date`.
  - **One-off manual**: ✓ Mark paid → sets `paid = true`, moves to **Paid** section at bottom. "Clear paid" button restores.
- **Subscriptions** also have ✓ Mark paid to advance their next_payment_date (same confirm prompt).
- **Three sections** in left panel: 🔄 Subscriptions | ✋ Manual payments | ✓ Paid.
- **Right panel**: category breakdown (Personal/Work/Study) with monthly subtotals. Grand total + yearly equivalent. Yearly subs show full amount on card + ÷12 in totals. One-off amounts excluded from monthly total.
- **Category**: Personal / Work / Study. Work/Study can optionally link to a curricular.
- **Billing cycles**: monthly / fortnightly / yearly / weekly / one-off (one-off auto-set for non-recurring manual).
- **Edit**: hover row → ✎ opens inline edit form (same fields as add).
- **`advanceDate(dateStr, cycle)`** helper: adds 1 month/fortnight/week/year to given date.
- **`toMonthly(amount, cycle)`** helper: converts any cycle to monthly equivalent.

#### GoalsWidget (`components/widgets/GoalsWidget.tsx`)

Full-page goals tracker at `/goals`. Dashboard summary at `components/dashboard/GoalsWidget.tsx`.

**Four tabs**: Monthly | Short-term (6-12 mo) | Long-term (5+ yr) | Decisions

**Categories**: Goals are grouped into editable named categories (default: Recreational, Finance, Career, Health) stored in `goal_categories`. Same categories appear in all three horizon tabs. Hover a category header to reveal ✎ (rename) and × (delete) buttons — uses `group/cat` + `group-hover/cat:opacity-60` Tailwind pattern. Rename opens an inline input; delete removes the category row (goals become uncategorised via `ON DELETE SET NULL`).

**Goal fields**: title, `category_id`, `horizon` (`monthly`/`short`/`long`), `target_date` (DATE), `notes`, `month` (YYYY-MM, monthly horizon only), `completed`, `position`. Click a goal card to expand it; expanded view shows notes, editable fields, and milestones.

**Milestones**: checklist items per goal (`goal_milestones` table). Progress bar auto-calculated from `completed / total`. Toggling a milestone optimistically updates local state then persists to Supabase.

**Monthly carry-over**: monthly tab shows goals where `month = currentMonth()` OR (`month < currentMonth()` AND `!completed`). Carried goals show an amber "carried from [Month Year]" badge. Month heading displayed at top of tab (e.g. "July 2026").

**Decisions tab**: standalone dated journal (`goal_decisions` table — `content`, `date`). No link to specific goals. Ordered by date descending.

**`load` as `useCallback`**: depends on `tab`; re-fetches categories, goals for the active horizon, then milestones for all loaded goals.

#### ShoppingWaitlistWidget (`components/widgets/ShoppingWaitlistWidget.tsx`)

Full-page widget at `/shopping` (cyan left-border accent). Tracks items you're waiting to go on sale at Woolworths / Coles / Chemist Warehouse.

- **Item fields**: name, optional `search_query` (keywords, defaults to name), optional exact product URL per store (`woolworths_url` / `coles_url` / `chemist_url`), alert rule (`alert_type`: `any` discount | `percent` ≥ N% off | `price` ≤ $N with `alert_value`), status (`watching` / `purchased`).
- **Check now**: POSTs `/api/shopping/check`. The route warms up a Woolworths session (homepage GET → cookies), then per item either fetches `apis/ui/product/detail/{stockcode}` (stockcode parsed from `woolworths_url`) or POSTs `apis/ui/Search/products` and takes the first available result. Each check inserts a `shopping_prices` snapshot (price history) and updates `shopping_items.on_sale_now`; `last_sale_detected_at` is set only on a not-met → met transition, which is what re-triggers alerts after dismissal. **Only Woolworths is implemented** — Coles (Akamai bot protection) and Chemist Warehouse (fully client-rendered, private search API) checkers are planned; the route returns a `note` when items have URLs for those stores.
  **Vercel cannot check prices**: Woolworths' Akamai bot protection 403s Vercel's datacenter IPs (confirmed 2026-07-04; identical requests succeed from residential IPs — full Chrome headers + fresh-cookie retry didn't help, it's IP/TLS-level). The route keeps the hardened headers and surfaces a "bot protection blocked the server" error. **Primary checking path is local**: `scripts/check-prices.mjs` — zero-dependency standalone script (plain Supabase REST, no supabase-js import) mirroring the route's logic. Scheduled via launchd agent `com.aaron.shopping-check` (daily 9:00, logs to `/tmp/shopping-check.log`). The scheduled copy lives at `~/.shopping-check/` (script + `.env` with the two `NEXT_PUBLIC_SUPABASE_*` vars **plus `SUPABASE_SERVICE_ROLE_KEY`** — required since per-user RLS; the anon key sees zero rows) because macOS TCC blocks launchd agents from reading `~/Documents`; after editing the repo script, re-copy it: `cp scripts/check-prices.mjs ~/.shopping-check/`. The script and the check route stamp `user_id: item.user_id` on `shopping_prices` inserts (service role bypasses the `auth.uid()` default). Email alerts still a future idea.
- **Alert semantics** (`lib/shopping.ts`): `meetsRule()` evaluates a snapshot against the item's rule; `alertActive()` = watching + `on_sale_now` + not dismissed since the last sale detection. Dismiss sets `dismissed_at` (badge clears until a new sale is detected). Purchased pauses checking (route only fetches `status = 'watching'`) but keeps the item; "Watch again" reactivates.
- **Layout**: header with last-checked timestamp + "+ Add item" + "Check now"; error banner (red) for per-item check failures, note banner (amber) for unsupported stores. When the check route returns `blocked: true` (all items 403/429 — server IP bot-blocked, i.e. any deployed check), the widget suppresses the red errors and shows an amber note explaining that checks run locally each morning instead. Sections: 🔔 On sale (green cards) | 👀 Watching | ✓ Purchased (collapsed). Cards show latest price per store with was-price strikethrough + `-N%` badge; expanded view shows matched product link, lowest seen price, keywords, edit form (same fields as add), Purchased/Delete. Editing a rule re-evaluates `on_sale_now` against the latest snapshots client-side.

#### WeekCalendar (`components/widgets/WeekCalendar.tsx`)

- Shows events from **all Google Calendars** (not just primary) by first fetching `calendarList` then parallel-fetching events per calendar in `/api/calendar`.
- Auto-refreshes events every 5 minutes when viewing the current week.
- `fetchEvents` is an extracted named function so it can be called by both the `useEffect` on session/weekOffset change and the auto-refresh interval.
- Shows a "Disconnect" button when authenticated to allow signing out and re-authenticating (needed if scope changes).
- **Error surfacing**: `calError` state captures any non-array API response and displays a red banner above the grid. Errors were previously silent (empty calendar with no indication of failure).

### Dashboard widgets (`components/dashboard/`)

Seven lightweight widgets for the home bento-grid dashboard (`app/page.tsx`):

- **`HeroWidget`**: Live ticking clock (1s interval), greeting by hour (Good morning/afternoon/evening/night), Melbourne location. Violet gradient background.
- **`QuoteWidget`**: 36 curated quotes, one per day (`getDayOfYear % 36`). Amber gradient. No external API.
- **`HabitsWidget`**: Today's habit checkboxes + monthly % donut ring (computed from month-to-date completions). Links to `/habits` full tracker.
- **`TodayScheduleWidget`**: Fetches `/api/calendar` for today's date range. Shows unauthenticated state with "Connect Calendar" button. Uses `useSession` from next-auth.
- **`PriorityTodosWidget`**: Todos where `priority = 'high'` OR `due_date = today`, not completed. Toggle-complete removes from list. Shows due-date badge.
- **`GoalsWidget`** (`components/dashboard/GoalsWidget.tsx`): Monthly goals summary — current month + carried-over incomplete goals, each with a milestone progress bar. Links to `/goals` full tracker.
- **`ShoppingWidget`** (`components/dashboard/ShoppingWidget.tsx`): "On Sale Now" — watching items with `on_sale_now = true`, each showing store, latest price and `-N%`. Links to `/shopping`.

Each widget is a self-contained card with `rounded-2xl shadow` styling, `overflow-hidden`, and `flex flex-col` for header + scrollable body.

The bento grid in `app/page.tsx`:
- Uses `react-grid-layout` v2 (`GridLayout` default export). In v2, `cols`/`rowHeight`/`margin` go in `gridConfig`, `draggableHandle` goes in `dragConfig.handle`, `resizeHandles` goes in `resizeConfig.handles`.
- Layout persisted to `dashboard_layout` Supabase table (debounced 800ms on `onLayoutChange`).
- Container width measured via `useContainerWidth({ measureBeforeMount: true })` exported from `react-grid-layout`; the `mounted` flag gates grid rendering until the first real measurement. **The ref'd container div must render on the component's very first render** — the hook attaches its ResizeObserver in a mount-once effect, so an early return (e.g. a loading state) that omits the ref'd div leaves the width frozen at the hook's 1280px default forever (grid too narrow on wide screens, overflowing on narrow ones). The loading spinner therefore renders *inside* the ref'd container, never instead of it. Do NOT use a manual `ResizeObserver` + `useState(1200)` either — same class of bug.
- Drag handle: `.drag-handle` strip at top of each `WidgetShell`.
- Resize: all four corner handles (`resizeConfig.handles: ['se','sw','ne','nw']`). Per-corner CSS in `globals.css` positions/rotates the shared corner glyph; handles have `z-index: 20` so the top corners sit above the `z-10` drag-handle strip (react-grid-layout's internal `cancel: '.react-resizable-handle'` keeps handle clicks from starting a drag).
- CSS for react-grid-layout is inlined in `app/globals.css` (not imported from node_modules).

### Google auth setup checklist (Supabase Auth era)

Common failure modes and their fixes:

1. **Google provider enabled in Supabase** — Authentication → Sign In / Providers → Google, with `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` pasted in and saved. Clicking "Continue with Google" without this returns `{"error_code":"validation_failed","msg":"Unsupported provider: provider is not enabled"}`.
2. **Authorized redirect URI in Google Cloud Console** — must include exactly `https://<project-ref>.supabase.co/auth/v1/callback` (Supabase shows this URL in the provider panel).
3. **Supabase redirect URLs** — Auth → URL Configuration must allowlist `http://localhost:3000/auth/callback` and the production `/auth/callback`; Site URL = production URL. Missing entries bounce sign-ins to the Site URL with no session.
4. **`calendar.readonly` scope on the OAuth consent screen** — explicitly added under "Scopes", not just requested in code.
5. **Google Calendar API enabled** — APIs & Services → Enabled APIs → Google Calendar API.
6. **Consent screen published** ("In production") — in **Testing** mode Google expires refresh tokens after **7 days**, which now surfaces as the calendar silently disconnecting weekly (`invalid_grant` → `google_tokens` row deleted → Connect button reappears). Verification isn't required for personal use — accept the "unverified app" warning via Advanced → Continue.
7. **Calendar shows Connect even though you just signed in** — Google's granular-consent screen ("Select what this app can access") can leave the Calendar checkbox unticked; Google then returns no calendar grant, `/auth/callback` still stores the refresh token, and calendar calls 403. Fix: Settings → Account → **Connect calendar** (forces a fresh consent — tick "See and download any calendar…"). If Google stops showing the checkbox at all, remove the app at `myaccount.google.com/permissions` first. (Diagnostic: 401 `notConnected` = no/dead token row; 403 from Google = token valid but missing the calendar scope.)
8. **"not invited" at sign-in** — email missing from `allowed_users`; add it via Settings → Admin → Invite (the signup trigger rejects non-allowlisted emails as `Database error saving new user`).

Calendar API error messages include the HTTP status and Google's response body (e.g. `Failed to fetch calendar list (401): Invalid Credentials`).

### Shared utilities

- `lib/types.ts` — all TypeScript interfaces and union types including: `Account`, `Todo`, `Habit`, `Section`, `Curricular`, `CurricularDeadline`, `Subscription`, `IncomeStream`, `AppleHealthLog`, etc. Union types: `AccountType`, `AccountGroup`, `IncomeCategory`, `Priority`, `BillingCycle`, `SubscriptionCategory`.
- `lib/utils.ts` — `cn()` (clsx + tailwind-merge), `formatCurrency()` (AUD, `en-AU`, rounds to whole dollars — finance widgets), `formatPrice()` (AUD with cents — shopping prices), `formatDate()`, `formatTime()`, `isToday()`, `isPast()`
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

Thirty-three Supabase tables: `profiles`, `allowed_users`, `google_tokens`, `accounts`, `income_streams`, `todos`, `notes` (one row per user, PK `user_id`, upserted), `habits`, `habit_completions`, `habit_groups`, `sections`, `todo_sections`, `nutrition_logs`, `gym_sessions`, `gym_exercises`, `gym_templates`, `gym_template_exercises`, `cookbook_recipes`, `apple_health_logs`, `curriculars`, `curricular_metrics`, `curricular_notes`, `curricular_links`, `curricular_deadlines`, `subscriptions`, `dashboard_layout`, `sidebar_prefs`, `goal_categories`, `goals`, `goal_milestones`, `goal_decisions`, `shopping_items`, `shopping_prices`. Base (single-user) schema SQL is in `supabase-schema.sql`; the multi-account layer (user_id columns, per-user RLS, profiles/allowlist/sidebar_prefs) is applied by `migrations/001..003` — see the Auth section. All data tables have per-user `"Own rows"` RLS policies.

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
-- Curricular deadlines (added for /curriculars Deadlines tab and /deadlines page):
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
-- Subscriptions/Payments widget (added for /finance page):
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
-- Fortnightly income (added to income_streams):
ALTER TABLE income_streams ADD COLUMN IF NOT EXISTS billing_cycle TEXT NOT NULL DEFAULT 'monthly';
-- Goals tables (added for /goals page):
CREATE TABLE IF NOT EXISTS goal_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE goal_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON goal_categories FOR ALL USING (true) WITH CHECK (true);
INSERT INTO goal_categories (name, position) VALUES
  ('Recreational', 0), ('Finance', 1), ('Career', 2), ('Health', 3);
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
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON goals FOR ALL USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS goal_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE goal_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON goal_milestones FOR ALL USING (true) WITH CHECK (true);
CREATE TABLE IF NOT EXISTS goal_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE goal_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON goal_decisions FOR ALL USING (true) WITH CHECK (true);
-- Sidebar nav custom order (added for drag-to-reorder sidebar):
CREATE TABLE IF NOT EXISTS sidebar_order (
  href TEXT PRIMARY KEY,
  position INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE sidebar_order ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON sidebar_order FOR ALL USING (true) WITH CHECK (true);
-- Shopping Waitlist tables (added for /shopping page):
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
```

## Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # server-only: price checker + health sync + admin member removal (bypasses RLS)
GOOGLE_CLIENT_ID=            # used by /api/calendar to refresh Google access tokens
GOOGLE_CLIENT_SECRET=
```

(`NEXTAUTH_URL`/`NEXTAUTH_SECRET` are retired — NextAuth was removed in Phase 4.)

Supabase Auth also needs dashboard config: Google provider enabled (same client id/secret; Supabase's `/auth/v1/callback` URL added to the Google OAuth client), and `http://localhost:3000/auth/callback` + the production `/auth/callback` in Auth → URL Configuration → Redirect URLs.

For Vercel deployment, add all six vars in the Vercel dashboard and add the Vercel URL as an authorized redirect URI in Google Cloud Console (`https://<your-domain>/api/auth/callback/google`). The Google OAuth app must have `https://www.googleapis.com/auth/calendar.readonly` scope enabled and the sign-in email added as a test user (while the app is in Testing mode).

**Important**: `NEXTAUTH_URL` must be set to the stable production URL (not a deployment-specific preview URL) on Vercel, otherwise OAuth redirect URIs won't match.
