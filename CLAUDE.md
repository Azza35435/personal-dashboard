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
- **Google Calendar**: `next-auth` v4 with Google provider stores `accessToken` in the JWT/session. The `/api/calendar` route uses `getServerSession(authOptions)` to retrieve it and proxies calls to the Google Calendar API. `authOptions` is exported from the auth route and imported by the calendar route.
- **Session**: `SessionProviderWrapper` (a thin `'use client'` wrapper around NextAuth's `SessionProvider`) is mounted in `app/layout.tsx` so `useSession()` works in all widgets.

### Widget structure

Each widget in `components/widgets/` is self-contained: it owns its loading state, its Supabase queries, and its inline add/edit/delete UI. There is no shared widget state or prop drilling. Widgets follow a consistent pattern:
- `loading` state with skeleton placeholders (`animate-pulse`)
- Inline forms (toggled by local `adding` state) rather than modals
- Click-to-edit for numeric values (balance, income amounts)
- `group` + `group-hover:opacity-*` Tailwind pattern for contextual delete buttons

### Shared utilities

- `lib/types.ts` — all TypeScript interfaces (`Account`, `Todo`, `Habit`, `Section`, etc.) and union types (`AccountType`, `AccountGroup`, `IncomeCategory`, `Priority`)
- `lib/utils.ts` — `cn()` (clsx + tailwind-merge), `formatCurrency()` (AUD, `en-AU`), `formatDate()`, `formatTime()`, `isToday()`, `isPast()`
- `types/next-auth.d.ts` — module augmentation to add `accessToken?: string` to the `Session` type

### Styling

Tailwind v4 (CSS-first config via `@import "tailwindcss"` in `globals.css`). Each widget has a solid colored background (`bg-{color}-{shade}`) with `text-white` and uses `bg-white/10`, `bg-white/20` for internal card surfaces. No dark mode toggle — the page background is hardcoded `bg-gray-950`.

### Database schema

Eight Supabase tables: `accounts`, `income_streams`, `todos`, `notes` (single row, id=1, upserted), `habits`, `habit_completions`, `sections`, `todo_sections`. Schema SQL is in `supabase-schema.sql`. RLS is enabled with open `"Allow all"` policies (single-user personal app).

`sections` stores named task groups (id, name, position, created_at). `todo_sections` is a many-to-many junction between todos and sections (todo_id, section_id, position) — `position` drives per-section drag-and-drop order. Both cascade-delete on parent row removal.

## Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=        # openssl rand -base64 32
```

For Vercel deployment, add all six vars in the Vercel dashboard and add the Vercel URL as an authorized redirect URI in Google Cloud Console (`https://<your-domain>/api/auth/callback/google`).
