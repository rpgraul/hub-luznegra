# AGENTS.md

## Repo state

- **Greenfield.** This repo contains only `prd.md` (the definitive PRD, in Portuguese). No code, no scaffold, no git repo yet. Do not search for source files — build from the PRD.
- `prd.md` is the single source of truth: stack, DB schema with RLS policies, business rules, navigation flows, and MVP roadmap (6 weeks) all live there. When in doubt, read it.
- Project: **Hub** — task management for small teams (max ~50 users), replacing ClickUp for Editora Luz Negra. Deployed at `hub.site-da-empresa.com.br`.

## Stack (final, per PRD §2)

React 19 + Vite + TypeScript · Tailwind + shadcn/ui · FontAwesome (CDN, no emojis) · TanStack Query v5 · Supabase (auth, PostgreSQL, RLS, Realtime) · Edge Functions (Deno) · Cloudflare Pages · Frappe Gantt v0.6.1+ · @hello-pangea/dnd · react-big-calendar (pt-BR) · Lexical (JSON serialization) · axios (token interceptors) · Resend e-mail · DeepSeek via OpenAI SDK (Edge Function).

## Non-obvious product rules (from PRD)

- **UI/UX language is pt-BR.** Use Portuguese labels and enums: status columns `backlog | todo | in_progress | review | done` → "Backlog, A Fazer, Em Andamento, Revisão, Concluído"; views `gantt | kanban | lista | calendario`.
- **No self-signup.** Login accepts username **or** e-mail; only admins create accounts (Supabase Admin API / Edge Function with admin rights).
- **Fixed "Minhas Tarefas" filter (MVP):** every view shows only tasks assigned to the logged-in user (`assigned_to`), in the active project. No "all tasks" toggle.
- **Auto-save everywhere** — no Save buttons; mutations use TanStack Query `onMutate` optimistic updates with rollback. Only destructive actions (delete task, archive project) open a confirmation modal.
- **Task drawer:** right-side slide-over, ~60% width on desktop, 100% with an X button on mobile; the list stays visible behind (70% opacity) and clicking another task swaps drawer content without closing.
- **User color:** deterministic HSL derived from user_id (`hsl(hash(user_id) % 360, 70%, 50%)`), applied as 15%-opacity row background; full color for avatar/badges.
- **Persistent per-user prefs** in `user_preferences`: `default_view` + `active_project_id`.

## DB & backend constraints

- Schema is fully specified in PRD §3: tables `profiles`, `user_preferences`, `projects`, `tasks` (hierarchical via `parent_id`), `task_comments`, `notifications`; indexes and `updated_at` trigger included — follow it, don't redesign.
- **RLS is mandatory on all tables** (PRD §3 shows a sample policy for `tasks`). Restrictive per-user policies: own profile, projects where owner or assigned, own notifications.
- `tasks.description` is Lexical JSON (`JSONB`). `tasks.status`/`priority`, `profiles.role`, `notifications.type`, `user_preferences.default_view` all have CHECK constraints — keep enum values exactly as in the PRD.
- Validations (PRD §6): username unique, case-insensitive, no spaces, min 3 chars; `start_date <= due_date` (frontend + backend); moving a task to `done` marks its subtasks `done`; deleting a task cascades subtasks.
- Holidays/ferias: saving dates only warns about tasks assigned in the period (modal alert, does not block).
- Edge Functions own: AI (DeepSeek, returns JSON action executed against DB), e-mails (Resend), notifications job (24h before due date).

## Deploy

Cloudflare Pages via Git. Supabase handles auth/DB/Edge Functions. No other infra; zero-cost mandate per PRD.