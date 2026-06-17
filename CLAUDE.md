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

**Single-page dashboard** (`app/page.tsx`) — a `'use client'` page with a `WeekCalendar` taking the main area and `TodoWidget` in a fixed `w-80` right sidebar. All widgets are loaded via `dynamic(..., { ssr: false })` to prevent Supabase client instantiation during server-side prerendering.

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

#### WeekCalendar (`components/widgets/WeekCalendar.tsx`)

- Shows events from **all Google Calendars** (not just primary) by first fetching `calendarList` then parallel-fetching events per calendar in `/api/calendar`.
- Auto-refreshes events every 5 minutes when viewing the current week.
- `fetchEvents` is an extracted named function so it can be called by both the `useEffect` on session/weekOffset change and the auto-refresh interval.
- Shows a "Disconnect" button when authenticated to allow signing out and re-authenticating (needed if scope changes).

### Google Calendar auth setup checklist

Common failure modes and their fixes (all must be true for sign-in to work):

1. **`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` set in Vercel** — missing env vars cause immediate Google rejection with no account chooser. Verify at `/api/debug-auth`.
2. **Authorized redirect URI in Google Cloud Console** — must include exactly `https://<your-domain>/api/auth/callback/google`. Mismatch shows `Error 400: redirect_uri_mismatch`.
3. **`calendar.readonly` scope added to OAuth consent screen** — must be explicitly added under "Scopes" in the consent screen editor, not just in code.
4. **Google Calendar API enabled** — APIs & Services → Enabled APIs → Google Calendar API.
5. **Test user email added and saved** — in OAuth consent screen → Test users, type email then press Enter before clicking Save.
6. **`NEXTAUTH_URL` set to stable production URL** — not a preview deployment URL.

Debug endpoint: `GET /api/debug-auth` returns which env vars are set and the exact `redirect_uri` being sent to Google.
Custom error page: `app/auth/error/page.tsx` shows the actual NextAuth error code (configured via `pages: { error: '/auth/error' }` in `authOptions`).

### Shared utilities

- `lib/types.ts` — all TypeScript interfaces (`Account`, `Todo`, `Habit`, `Section`, etc.) and union types (`AccountType`, `AccountGroup`, `IncomeCategory`, `Priority`)
- `lib/utils.ts` — `cn()` (clsx + tailwind-merge), `formatCurrency()` (AUD, `en-AU`), `formatDate()`, `formatTime()`, `isToday()`, `isPast()`
- `types/next-auth.d.ts` — module augmentation to add `accessToken?: string` to the `Session` type

### Styling

Tailwind v4 (CSS-first config via `@import "tailwindcss"` in `globals.css`). Each widget has a solid colored background (`bg-{color}-{shade}`) with `text-white` and uses `bg-white/10`, `bg-white/20` for internal card surfaces. No dark mode toggle — the page background is hardcoded `bg-gray-950`.

### Database schema

Eight Supabase tables: `accounts`, `income_streams`, `todos`, `notes` (single row, id=1, upserted), `habits`, `habit_completions`, `sections`, `todo_sections`. Schema SQL is in `supabase-schema.sql`. RLS is enabled with open `"Allow all"` policies (single-user personal app).

- `todos` has a `position INTEGER NOT NULL DEFAULT 0` column for drag-and-drop ordering within priority groups and unsectioned lists.
- `sections` has `color TEXT` (nullable hex string, e.g. `#3b82f6`) and `position INTEGER NOT NULL DEFAULT 0` for drag-to-reorder.
- `todo_sections` is a many-to-many junction between todos and sections (todo_id, section_id, position) — `position` drives per-section drag-and-drop order. Both cascade-delete on parent row removal.

**If setting up from scratch**, run `supabase-schema.sql` in the Supabase SQL editor. If migrating an existing DB, also run:
```sql
ALTER TABLE todos ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sections ADD COLUMN IF NOT EXISTS color TEXT;
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
