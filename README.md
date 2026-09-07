# Berkeley Networking Tracker

A private contact tracker for the people you want to stay connected with at Berkeley. Each
person you sign up gets their own list: add someone you met, note where you met them and what
you talked about, mark how much of a priority it is to follow up, and sort or filter the list
later. The point of the project is not the CRUD — it is that **ownership is enforced by
Postgres, not by application code**. Every row of the `contacts` table is guarded by Row Level
Security policies written against `auth.user_id()`, so one user cannot read or change another
user's contacts even by calling the database API directly with their own valid token.

**Live app:** _pending deployment — see [Deployment](#deployment)_

---

## Table of contents

- [Features](#features)
- [Screenshots and walkthrough](#screenshots-and-walkthrough)
- [Technology stack](#technology-stack-and-why)
- [Architecture](#architecture)
- [Database schema](#database-schema)
- [Authentication and RLS ownership](#authentication-and-rls-ownership)
- [Local setup](#local-setup)
- [Environment variables](#environment-variables)
- [Testing](#testing)
- [Deployment](#deployment)
- [Grading evidence](#grading-evidence)
- [Rubric traceability](#rubric-traceability)
- [Known limitations](#known-limitations-and-what-id-do-next)

---

## Features

- **Sign up, sign in, sign out** with email and password, via Neon Managed Better Auth.
- **A private contact list per user.** Enforced in the database, not the UI.
- **Add a contact** with name, company, role, where you met, notes, and priority.
- **Edit and delete** your own contacts, with a confirmation step before deleting.
- **Sort** by name, company, priority, or date added, ascending or descending.
- **Filter** by priority, and search by name or company.
- **Priority is constrained** to `high`, `medium`, or `low` in three independent places.
- **Validation with clear errors** — an empty name or an invalid priority fails with a message
  attached to the specific field.
- **Understandable loading, empty, success, and error states**, including a distinct empty
  state for "no contacts yet" versus "nothing matches your filters".
- **Works on phone and desktop** — the list is a table on wide screens and stacked cards on
  narrow ones.
- **Data persists** in Neon Postgres and survives a refresh, a new tab, and a new device.

---

## Screenshots and walkthrough

_Pending deployment. This section will contain: sign-in and sign-out; creating, editing,
deleting and refreshing a contact; the two-account privacy test; and an invalid input failing
safely. See [Grading evidence](#grading-evidence)._

---

## Technology stack and why

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | **Next.js 16** (App Router, TypeScript) | One project holds both the React frontend and the server-side API routes, while keeping them in genuinely separate execution contexts. Deploys to Vercel with no configuration. |
| Styling | **Tailwind CSS v4 + shadcn/ui** (Radix primitives) | A real component system rather than hand-written CSS: accessible dialogs, selects and tables out of the box, with consistent tokens for light and dark. Radix handles focus trapping and keyboard behaviour I would otherwise get wrong. |
| Database | **Neon Postgres** | Serverless Postgres, and — the reason it matters here — RLS policies that the Data API enforces on every request. |
| Data access | **Neon Data API** via `@neondatabase/neon-js` | A REST layer over Postgres that validates the caller's JWT and exposes its `sub` claim to SQL as `auth.user_id()`. That is what makes database-enforced ownership possible without writing a backend session layer. |
| Auth | **Neon Managed Better Auth** | Users and sessions live in the same Neon project as the data, and it issues the JWT the Data API validates. One identity, one source of truth. |
| Validation | **Zod** | One schema, used by the API routes as the authoritative gate. |
| Tests | **Vitest** | Fast, TypeScript-native, and runs the real route handlers without a server. |
| Hosting | **Vercel** | First-class Next.js support and per-environment variables. |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ BROWSER  (React client components)                           │
│                                                              │
│  @neondatabase/neon-js — two-URL object form:                │
│    createClient({ auth: { url }, dataApi: { url } })          │
│                                                              │
│    ├── AUTH   sign up / sign in / sign out / session          │
│    └── READS  select + sort + filter ──────────┐              │
│                                                │              │
│    WRITES ── fetch POST/PATCH/DELETE ──┐       │              │
└────────────────────────────────────────┼───────┼──────────────┘
                                         │       │
                 ┌───────────────────────▼──┐    │
                 │ BACKEND                  │    │
                 │ Next.js Route Handlers   │    │
                 │  /api/contacts           │    │
                 │                          │    │
                 │  1. require bearer → 401 │    │
                 │  2. Zod validate   → 400 │    │
                 │  3. call Data API as     │    │
                 │     the calling user     │    │
                 └───────────────────────┬──┘    │
                                         │       │
                 ┌───────────────────────▼───────▼──────────────┐
                 │ NEON DATA API                                │
                 │  verifies JWT signature                      │
                 │  role = authenticated, auth.user_id() = sub  │
                 └───────────────────────┬──────────────────────┘
                                         │
                 ┌───────────────────────▼──────────────────────┐
                 │ NEON POSTGRES                                │
                 │  RLS policies  (who owns the row)            │
                 │  CHECK constraints (is the row valid)        │
                 └──────────────────────────────────────────────┘
```

### Frontend

React client components under `app/` and `components/`. The browser holds one
`@neondatabase/neon-js` client built with the **two-URL object form** — `auth.url` and
`dataApi.url`, both from `NEXT_PUBLIC_` variables (`lib/neon-browser.ts`). It handles
authentication and **reads**.

### Backend

Next.js Route Handlers in `app/api/contacts/`. This is the trusted boundary: it is server code
the user cannot modify. Every **write** goes through it, in a fixed order — require a bearer
token, validate the body with Zod, then call the Data API. `lib/neon-server.ts` builds a
Data API client from the caller's token and nothing else.

### Why reads are direct and writes are proxied

This split is deliberate, and it is the part worth explaining.

**Reads go straight from the browser to the Data API** because RLS filters them inside
Postgres. Routing them through the server would add a hop that protects nothing — and it would
*hide* the property being graded. Because reads are direct, the security claim is falsifiable:
open DevTools, copy the bearer token, `curl` the Data API yourself, and you still get only your
own rows. A proxy would make that impossible to check from the outside.

**Writes are proxied** because validation is only trustworthy when it runs somewhere the user
cannot edit. The browser can be told to send anything; the route handler decides what is
acceptable.

The obvious objection: *a determined user could skip the API route and write to the Data API
directly, bypassing Zod.* That is true, and it is exactly why the same rules exist as `CHECK`
constraints in the table. The API route gives good error messages; the database makes the rule
unbreakable. Neither one alone would be enough.

### The server holds no database credential

`lib/neon-server.ts` uses the external-auth form of `createClient`, supplying a `getToken`
function that returns the caller's own JWT. There is no service role and no connection string
at runtime — the server acts strictly *as the signed-in user*. If a route handler were buggy,
the worst it could do is act on that one user's own rows. `DATABASE_URL` exists only to apply
the schema and is never read by application code.

### Key files

| File | Role |
| --- | --- |
| `db/schema.sql` | Table, CHECK constraints, RLS policies, grants |
| `lib/neon-browser.ts` | Browser client (two-URL object form); auth + reads |
| `lib/neon-server.ts` | Server client bound to the caller's token; bearer parsing |
| `lib/validation.ts` | Zod schemas — the authoritative backend validation |
| `lib/sort-filter.ts` | Sort/filter allowlists and search sanitisation |
| `lib/contacts-api.ts` | Browser helper that calls the write API |
| `app/api/contacts/route.ts` | `POST` create |
| `app/api/contacts/[id]/route.ts` | `PATCH` edit, `DELETE` remove |
| `components/contacts-app.tsx` | List, toolbar, all four UI states |
| `tests/` | Vitest suites |

---

## Database schema

One table, `contacts`. Full DDL in [`db/schema.sql`](db/schema.sql).

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| `id` | `bigint` | primary key, generated by default as identity | Surrogate key. |
| `user_id` | `text` | **not null**, **default `auth.user_id()`** | The owner. Stamped by the database from the verified JWT — the app never sends it. |
| `name` | `text` | not null, `check (length(trim(name)) > 0)` | The only required user input. The `trim` matters: `'   '` is not a name. |
| `company` | `text` | nullable | Blank input is stored as `NULL`, not `''`. |
| `role` | `text` | nullable | |
| `where_met` | `text` | nullable | Where you met them. |
| `notes` | `text` | nullable | |
| `priority` | `text` | not null, default `'medium'`, `check (priority in ('high','medium','low'))` | |
| `created_at` | `timestamptz` | not null, default `now()` | |
| `updated_at` | `timestamptz` | not null, default `now()` | Set by the `PATCH` handler on edit. |
| `priority_rank` | `smallint` | generated always as stored | `high→1, medium→2, low→3`. |

Two indexes: `contacts_user_id_idx` on `(user_id)`, and `contacts_priority_idx` on
`(user_id, priority_rank)`.

**Why `priority_rank` exists.** Sorting by `priority` as text gives `high, low, medium` —
alphabetical, and wrong. The correct order is a `CASE` expression, but the browser sorts through
PostgREST, which cannot express one in an `ORDER BY`. Materialising the rank as a generated
column makes "sort by priority" both correct and indexable.

---

## Authentication and RLS ownership

**The request flow.** A user signs in through Managed Better Auth, which returns a session
carrying a signed JWT. Its `sub` claim is the user's id and its `role` claim is
`authenticated`. Every Data API request — from the browser directly, or from a route handler
acting on the user's behalf — carries that JWT as `Authorization: Bearer …`. Neon verifies the
signature, switches to the Postgres `authenticated` role, and exposes the `sub` claim to SQL as
`auth.user_id()`.

**The ownership rule.** One sentence: *a row of `contacts` is visible and writable only when its
`user_id` equals `auth.user_id()`.*

Two mechanisms enforce it together:

1. **Ownership is assigned, not claimed.** `user_id` defaults to `auth.user_id()`, and the API
   route never sends that column. A user cannot create a row owned by someone else, because the
   value comes from a token they cannot forge.
2. **Four policies, one per verb**, all scoped to the `authenticated` role:

```sql
create policy contacts_select_own on contacts
  for select to authenticated using (auth.user_id() = user_id);

create policy contacts_insert_own on contacts
  for insert to authenticated with check (auth.user_id() = user_id);

create policy contacts_update_own on contacts
  for update to authenticated
  using (auth.user_id() = user_id)          -- which rows you may edit
  with check (auth.user_id() = user_id);    -- what they may become

create policy contacts_delete_own on contacts
  for delete to authenticated using (auth.user_id() = user_id);
```

**Why `UPDATE` needs both clauses.** `USING` decides which rows the statement can see; without
it you could edit anyone's contact. `WITH CHECK` validates the row *after* the update; without
it you could take one of your own rows and set `user_id` to someone else's — handing them a row,
or smuggling one into their list. Both are required, and the update policy carries both.

**Why `GRANT` is also required.** Enabling RLS blocks everything until a policy allows it, but
the `authenticated` role still needs table privileges to get as far as policy evaluation. RLS
without `GRANT` produces a confusing permission error; `GRANT` without RLS silently exposes
every row. `db/schema.sql` does both. The `anonymous` role is granted nothing, so a signed-out
caller can read nothing at all.

**What is not a security boundary:** the sign-in screen. Hiding the UI from a signed-out user is
a convenience. If someone bypassed the UI entirely, RLS would still return them nothing.

---

## Local setup

Prerequisites: Node.js 20+, npm, and a free [Neon](https://neon.com) account.

**1. Clone and install**

```bash
git clone https://github.com/shuoran0121/berkeley-networking-tracker.git
cd berkeley-networking-tracker
npm install
```

**2. Create the Neon project and enable both services**

In the [Neon Console](https://console.neon.tech):

1. Create a project.
2. **Auth** → **Enable Auth** (Managed Better Auth). Copy the **Auth URL** from the
   Configuration tab.
3. **Data API** → tick **Grant public schema access** → **Enable Data API**. Copy the
   **API URL** from the API tab.
4. **Connect** → copy the Postgres connection string.

**3. Configure environment variables**

```bash
cp .env.example .env.local
```

Fill in the three values from step 2. See [Environment variables](#environment-variables).

**4. Apply the schema**

```bash
psql "$DATABASE_URL" -f db/schema.sql
```

No `psql`? Paste the contents of `db/schema.sql` into the Neon Console SQL Editor. The file is
re-runnable.

**5. Run**

```bash
npm run dev
```

Open <http://localhost:3000>. If the app shows a "Neon is not configured" notice, `.env.local`
is missing or the dev server needs a restart to pick it up.

**6. Verify**

```bash
npm test
```

---

## Environment variables

Names only — real values live in `.env.local`, which is gitignored. The committed
[`.env.example`](.env.example) contains placeholders only.

| Variable | Exposed to browser | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_NEON_AUTH_URL` | **Yes** | Managed Better Auth endpoint. |
| `NEXT_PUBLIC_NEON_DATA_API_URL` | **Yes** | Neon Data API endpoint. |
| `DATABASE_URL` | **No — server only** | Applying `db/schema.sql`. Never read at runtime. |

**Why two of these are public on purpose.** They are addresses, not credentials. Knowing the
Data API URL gets an attacker nothing: every request still needs a JWT signed by Neon Auth, and
every policy restricts rows to the user that token identifies. The security lives in RLS, which
is exactly where it can't be bypassed by a modified client.

`NEON_AUTH_BASE_URL` and `NEON_AUTH_COOKIE_SECRET` are **not used** by this implementation —
authentication is handled by the browser client against Managed Better Auth, so there is no
server-side session cookie to sign. No cookie secret exists to leak.

---

## Testing

```bash
npm test
```

**49 tests across three suites.** They run without a database or a network connection, because
every case is decided before the handler reaches Neon.

| Suite | What it verifies |
| --- | --- |
| `tests/validation.test.ts` | **Required fields and priority values.** An absent, empty, or whitespace-only name is rejected with `Name is required`. Each of `high`/`medium`/`low` is accepted; `urgent` and `High` are rejected. An omitted priority defaults to `medium`. Blank optional text becomes `NULL`. A partial update is allowed, but an empty one is not. |
| `tests/api-contacts.test.ts` | **The real route handlers.** `POST` with no `Authorization` header returns **401**; so do a `Basic` scheme and an empty bearer. With a token but a blank name or `priority: 'urgent'`, `POST` returns **400** carrying `fieldErrors`. Malformed JSON returns 400. `PATCH`/`DELETE` require auth and reject a non-numeric id. |
| `tests/sort-filter.test.ts` | **Sort and filter safety.** Only allowlisted sort keys resolve; `user_id` and `name; drop table contacts` return `null`. `priority` maps to `priority_rank`. Search terms are stripped of characters that would restructure a PostgREST filter. |

The suite that matters most is `api-contacts.test.ts`: it proves the auth guard and the
validation gate on the actual exported handlers, not on a reimplementation of them.

---

## Deployment

_This section is filled in once deployed; steps are the ones actually used._

```bash
npm i -g vercel
vercel link
vercel --prod
```

1. Push the repository to GitHub.
2. Import it into Vercel (or `vercel --prod` from the CLI).
3. Add `NEXT_PUBLIC_NEON_AUTH_URL` and `NEXT_PUBLIC_NEON_DATA_API_URL` as **Production**
   environment variables in Vercel. `DATABASE_URL` is not needed at runtime — add it only if you
   intend to run migrations from CI.
4. **Add the deployed Vercel domain to Neon Auth's trusted origins**, or sign-in will be
   rejected from the production URL.
5. Open the public URL in a private window and run the checks in
   [Grading evidence](#grading-evidence), including the two-account privacy test.

---

## Grading evidence

_Populated after deployment._

- [ ] Automated test output showing passing validation tests
- [ ] Sign-in and sign-out
- [ ] Creating, editing, deleting, and refreshing a contact
- [ ] Two-account test: User A cannot access User B's contacts
- [ ] One invalid input failing safely
- [x] Explanation of the contacts schema and the RLS ownership rule — see
      [Authentication and RLS ownership](#authentication-and-rls-ownership)
- [x] No committed secret values — `.gitignore` excludes `.env*` except `.env.example`

**Verify there are no secrets in the repository yourself:**

```bash
git log -p | grep -iE "postgres://|postgresql://|neon_auth_cookie_secret" | grep -v REPLACE
```

---

## Rubric traceability

| Requirement | Where it is implemented | How to verify |
| --- | --- | --- |
| Frontend and backend separated | `components/` + `app/` vs `app/api/contacts/` | `lib/neon-server.ts` is imported only by route handlers |
| Design or component system | Tailwind v4 + shadcn/ui | `components/ui/`, `components.json` |
| Neon Postgres + Managed Better Auth + Data API | `lib/neon-browser.ts`, `lib/neon-server.ts` | Two-URL object form in `lib/neon-browser.ts` |
| Hosting on Vercel | — | Live URL at the top |
| Sign up / in / out | `components/auth-panel.tsx`, `contacts-app.tsx` | Screenshots |
| Contact fields incl. priority | `db/schema.sql`, `components/contact-dialog.tsx` | Schema table above |
| Priority only high/medium/low | Zod enum + `CHECK` constraint | `npm test` |
| Sortable list | `lib/sort-filter.ts` + toolbar | Sort by priority → high first |
| Edit and delete own contacts | `app/api/contacts/[id]/route.ts` | Walkthrough |
| Survives refresh | Neon Postgres | Refresh the page |
| Empty name / bad priority fail clearly | `lib/validation.ts` + CHECKs | `npm test`, screenshot |
| Loading / empty / success / error states | `components/contacts-app.tsx` | Walkthrough |
| Web and mobile friendly | Table at `md+`, cards below | 375px and 1280px screenshots |
| `user_id` text, default `auth.user_id()`, not null | `db/schema.sql` | Schema table above |
| RLS enabled | `db/schema.sql` | `alter table contacts enable row level security` |
| Separate select/insert/update/delete policies | `db/schema.sql` | Four `create policy` statements |
| Every policy restricts to the signed-in user | `db/schema.sql` | All four use `auth.user_id() = user_id` |
| Update cannot reassign ownership | `contacts_update_own` `WITH CHECK` | Explained above |
| Two accounts prove isolation | RLS | Two-account evidence |
| Secrets stay server-only | `.gitignore`, `.env.example` | `grep` command above |
| At least one automated test | `tests/` | `npm test` |

---

## Known limitations and what I'd do next

1. **No email verification or password reset.** Managed Better Auth supports both; neither is
   wired up, so a typo in an email address is unrecoverable. This is the first thing I would add.
2. **Writes bypass the UI's validation if you call the Data API directly.** The `CHECK`
   constraints still hold, so nothing invalid is ever stored — but the error a direct caller sees
   is a raw constraint violation rather than a friendly message. Acceptable, and deliberate: the
   database is the backstop, not the UX layer.
3. **The list is not paginated.** Every contact loads at once. Fine for a personal network of
   tens or hundreds; it would need `range()`-based pagination in the thousands.
4. **Search is a `LIKE` scan** across name and company. A trigram index or `tsvector` column
   would be the right fix once the table is large.
5. **No optimistic UI.** Every write waits for the server and then refetches, which is simple and
   always consistent but shows a brief delay. Optimistic updates with rollback would feel faster.
6. **Notes are plain text.** No formatting, tags, or reminders. A "follow up by" date with a
   sorted "due" view is the feature I would actually want next.
7. **Tests cover the guard rails, not the browser.** The auth and validation gates and the
   allowlists are tested; the React components are not. Playwright tests driving a real sign-up
   and the two-account privacy check would close that gap and make the manual evidence below
   automatic.
