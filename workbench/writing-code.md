# Writing code

Read this before writing or editing any code here. `CLAUDE.md`
owns the universal layer (architecture index, README rules, the commit
gate); this doc owns everything about producing code: where it goes, the
data and its migrations, local development, the conventions tooling can't
enforce, and the verification loop.

## Where code lives

Everything runs in one Node server on Railway (`source/node.ts`).
`source/server.ts` decides who answers a request:

| Path       | Handled by                       | Rendered                                     |
| ---------- | -------------------------------- | -------------------------------------------- |
| `/api/*`   | Hono (`source/backend/index.ts`) | —                                            |
| Every page | TanStack Start                   | Prerendered at build, served as static files |
| Not a page | TanStack Start                   | On request: the not-found page               |

Static files, the prerendered pages among them, are served **before**
`source/server.ts` runs. A page never reaches it, so don't put
request-time logic (auth, redirects, headers) in front of one and expect it
to run. A page that needs to change per request is client-rendered (`ssr:
false` on its route) and left out of the prerender.

### Headless

**Every database read and write goes through the API under `/api`.** It's
a rule, not a preference: the website calls the API through its typed
client (`source/backend/client.ts`) with the visitor's session, and
scripts, other apps and LLMs call it over HTTP with an API token, once
there is one. So:

- **Pages, route loaders and TanStack server functions never touch the
  database**, and nothing in `frontend/` imports from `database/`. A page
  that needs data asks the API, through TanStack Query.
- **`database/` is imported only by `backend/`**, and by its own scripts
  and tests.
- **A feature is a route before it's a screen.** Anything a person can do
  on the site, a script or an agent can do through the same route, with
  the same checks.

One way to the data means one place for the checks (zod), the
authorization and the tests, and one API for the site, scripts and agents
alike.

### Choosing where new code goes

`source/` has four areas, and the line between the first two is the one that
matters:

- **`frontend/`** — the website: file-based routes, components, queries,
  the router and styles. TanStack Start renders it on the server too (the
  prerender), so "frontend" means _the site_, not "runs only in the
  browser".
- **`backend/`** — the Hono API under `/api` (`index.ts`), and the typed
  client the frontend calls it with (`client.ts`). **`frontend/` imports
  nothing from `backend/` except `client.ts` and types** (`import type`).
  `client.ts` only takes the API's types, so no server code reaches the
  browser bundle; importing anything else from `backend/` would ship it.
- **`database/`** — the Postgres database: its Drizzle schema, `connect()`
  and `appDatabase()`, the migrations ([Data](#data)) and this checkout's
  own Postgres ([Local development](#local-development)). Server-only: used
  by `backend/`, never by `frontend/`.
- **`utilities/`** — what both sides share, like `primitives/result.ts`. Nothing
  here may import from the other three.

`source/server.ts` and `source/node.ts` sit above them all. TanStack's
`router.tsx` and generated `routeTree.gen.ts` live in `frontend/`
(configured in `vite.config.ts`).

- **A new page** → a route file under `source/frontend/routes/`. Link to
  it from somewhere reachable from `/`: the prerenderer crawls links, and an
  unlinked page is not prerendered. A page that throws during the crawl
  fails `pnpm build`.
- **A new API endpoint** → a route on the Hono app in `source/backend/`,
  mounted in `index.ts`, and called from the browser through the typed
  client in `source/backend/client.ts`, inside a TanStack Query
  `queryOptions` or `mutationOptions` in `source/frontend/queries/`, like
  `health.ts`. A group of routes is a Hono app of its own, in a file named
  for what it's about (`backend/health.ts`), mounted in `index.ts`. Never a TanStack server function
  ([Headless](#headless)): Hono routes are plain HTTP, so a webhook, a
  script or an agent can reach them too.
  Check what comes in with zod. A route reads the database from
  `c.var.database`, never `appDatabase()` directly, so a test can hand it
  its own.
- **A table or a column** → `source/database/schema.ts`, with a migration
  from `pnpm database:generate` ([Migrations](#migrations)).
- **A new React component** → `source/frontend/components/`, and a shadcn
  primitive in `components/primitives/` with `pnpm dlx shadcn@4 add
  <name>` (`components.json` says where).
- **Something that runs in the background or on a schedule** → this
  service first, as routes under `/api` and code beside them. A second
  service in the Railway project (`.railway/railway.ts`), started from this
  same package with its own start command, or a cron service with a
  `cronSchedule`, only when something must deploy or scale on its own. Not
  a second package: one database means one package.
- **Content** lives where it's published: a page's copy in its route, and
  copy more than one page shares in `source/utilities/`.

## Data

There's **one database, Postgres**, on Railway, queried with Drizzle
(`drizzle-orm/node-postgres`) from `source/database/`.

|                       | Postgres                                                                    |
| --------------------- | --------------------------------------------------------------------------- |
| Holds                 | nothing yet: `schema.ts` has the first table's shape in its header          |
| Schema                | `source/database/schema.ts`                                                 |
| New migration         | `pnpm database:generate`, into `source/database/migrations/`                |
| Applied in production | `pnpm database:migrate`, Railway's pre-deploy command, before each deploy   |
| `pnpm dev` uses       | the checkout's own (`source/database/local/`), with the branch's migrations |
| The tests use         | a database of each test's own, on the checkout's Postgres, in CI too        |
| Checked in CI by      | `pnpm database:check`, the tests from empty, and the PR's upgrade test      |
| Read by hand with     | `pnpm database:sql "<query>"`, or the database's Data tab on Railway        |
| Restored with         | Railway's backups of the database's volume, in its dashboard                |

The conventions every table follows are in `schema.ts`'s header: named for
what it hangs off, snake_case columns, uuids for our own rows, every
timestamp a `timestamptz` to the millisecond (`columns.ts`), compared
against `now` and `fromNow` from `time.ts`.

- **In a Hono route, use `c.var.database`.** `source/backend/index.ts` puts
  it there for every request: `appDatabase()`, the server's one pool,
  connected to `DATABASE_URL` (Railway sets it), or to the checkout's own
  database in a dev server, whatever `DATABASE_URL` says. A script makes its
  own with `connect(url)` and ends it with `.$client.end()`.
- **Statements that must land together go in one transaction**:
  `database.transaction(async (tx) => …)`. Inside it, every query goes
  through `tx`: one on `database` runs on another connection, outside the
  transaction. A function that may run inside one takes the `Database`
  type, which a `tx` is too.
- **Index the column a foreign key or a join follows.** Postgres doesn't
  index a foreign key's column by itself, and a cascade from a parent then
  scans the child's table.
- **The server keeps 10 connections** (`connect()`'s pool), of the 500
  Railway's Postgres allows. A query that holds one for long, or a loop
  that opens many, starves every request behind it.
- **Tables go in `public`**, the app's data, except what no person ever
  sees (sign-in's codes and sessions, the machinery's own state), which
  goes in an `internal` schema (`pgSchema("internal")` in `schema.ts`), made
  when the first such table arrives. The upgrade test's sample rows
  already fill both (`SCHEMAS` in `tests/support/fill.ts`).

### Migrations

**The schema is code.** `schema.ts` is the source of truth, and every
change ships as a migration:

1. Edit the schema.
2. Run `pnpm database:generate --name=<what-it-does>` (with `--custom` for
   an empty one to write by hand). drizzle-kit diffs the schema into a new
   SQL file under `source/database/migrations/`, and its snapshot under
   `meta/`, which `pnpm format` then formats. **Read the SQL** — it is
   exactly what will run against production.
3. `pnpm dev` applies it to the checkout's database as it starts, and the
   tests apply every migration from empty. `pnpm database:check`, part of
   `pnpm check`, checks the journal's order and lints every migration with
   squawk (below). `pnpm database:upgrade-test` applies it over
   `origin/main`'s migrations, on a database with sample rows in every
   table, as CI's `tests` jobs do on the PR.
4. Commit the schema change and the migration together.
5. On merge, Railway runs `pnpm database:migrate`
   (`source/database/migrate.ts`) before the new version starts: every
   pending migration, in one transaction, recorded in
   `drizzle.__drizzle_migrations`. One that fails rolls back with all the
   others, and the deploy stops with the current version still serving.

Never hand-edit a migration that has already shipped (the upgrade test
fails one whose hash changed), never change production's schema by hand,
and never use `drizzle-kit push` (it changes the database with no
migration file to review or replay).

**A migration runs while the previous version still serves**, since it
runs before the new one starts. So:

- **It must be safe for the old code.** Adding a table, a nullable column,
  or a column with a default is safe. Renaming or dropping something the
  running code reads is not: do it in two deploys, first code that stops
  using it, then the migration that removes it.
- **It must not hold a lock the app waits on.** The migration's connection
  sets `lock_timeout` to 10 seconds and `statement_timeout` to 240
  (`MIGRATION_SETTINGS`), under Railway's 300-second pre-deploy timeout, so
  one stuck behind a busy table, or one that runs too long, fails and rolls
  back rather than stalling the app or being killed part way. Building an
  index on a table that has rows blocks its writes until it's done, and
  `CREATE INDEX CONCURRENTLY` can't run inside the migration's transaction,
  so an index on a big table is built outside a migration, with a migration
  that only records it.
- **Existing rows must fit it.** A new `NOT NULL` column needs a default,
  and a new unique index fails on duplicates already there. The upgrade
  test (`source/database/tests/upgrade.test.ts`) fills every table with
  rows shaped to trip exactly that (`tests/support/fill.ts`: a null in each
  nullable column, the same value in each column outside a key), then
  applies the PR's migrations over them.
- **Every lock it takes is held until it commits.** A deploy applies every
  pending migration in one transaction, so a table any statement locks
  stays locked until the last one is done.
- **Data that moves is moved in pages**, by a job, not by a migration over
  a big table, which would run inside the deploy.

**squawk lints every migration** (`.squawk.toml`), in `pnpm database:check`:
for a lock that would hold up the app, like an index on an existing table
(`require-concurrent-index-creation`), and for a change the old version
can't survive, like a dropped column (`ban-drop-column`). When one is safe,
say why on the line before the statement, then the rule it breaks:

```sql
-- customers has a few hundred rows
-- squawk-ignore require-concurrent-index-creation
CREATE INDEX "customers_email_index" ON "customers" ("email");
```

**The journal's timestamps stay in order**, which `pnpm database:check`
checks. Drizzle applies only the migrations timed after the newest one a
database has, so one generated on a branch before another merged comes out
older, and would never run in production: generate it again on top. The
upgrade test fails it too, since the database ends up without it.

Once production's rows get big or varied enough that sample rows stop
standing in for them, rehearse each PR's migrations on a copy of
production too: copy it nightly into a second Railway environment, and
apply the branch's migrations to a copy of that in CI, timing each
statement.

### By hand

- **`pnpm database:sql "<query>"`** runs one query against the checkout's
  database, in a read-only session, and prints the rows. For anything
  more, a `psql` of your own reaches it at
  `node source/database/local/server.ts url`. Write only to your own
  checkout's database.
- **`pnpm database:reset`** deletes the checkout's database and migrates a
  new one from empty.
- **`pnpm database:seed`** puts sample rows in it, to try things out on
  (`source/database/seed/seed.ts`, run by `workbench/scripts/seed.mjs`
  through Vite's module runner, so it can use the `@/` paths). Each table
  that wants sample rows gets a seeder there, written out by hand, which
  replaces its rows, so seeding again is safe. Its test seeds an empty
  database, so a schema change that breaks it fails `pnpm check`. There
  are none until the first table.
- **Production's** is in Railway's dashboard: the Postgres service's Data
  tab. It's only on Railway's private network, so a script that writes to
  it runs on the app's service, with `railway ssh --service <service> --
  <command>`, which has `DATABASE_URL`.
- **Restoring production** is Railway's: backups of the database's volume,
  restored from its dashboard. Rolling back a deploy doesn't roll back a
  migration, so a migration that committed and changed data wrongly comes
  back from a backup, and loses every write since.

### Local development

**A fresh clone runs with `pnpm install && pnpm dev`**, on a Mac or on
Linux, with no Docker. There's no credential to set: `pnpm dev` starts the
checkout's own Postgres, applies the branch's migrations to it, and serves
on http://localhost:3000. The tests start it too, and make their databases
on it.

- **It's a Postgres 18 from npm**: `embedded-postgres` brings the binaries
  for the machine it's installed on, and `source/database/local/server.ts`
  makes the server with `initdb` the first time and starts it with
  `pg_ctl`. It runs in the background, like a database in Docker would,
  until `pnpm database:stop`, a restart, or half an hour with nothing
  connected, and `pnpm database:reset` empties it. It sorts text with ICU's
  `en-US`, as production's `en_US.utf8` does, and allows 500 connections,
  as Railway's does.
- **It stops itself once it's idle**: whatever starts it gives it a watch,
  a process of its own beside it (`local/idle.ts`), which counts what's
  connected every minute and stops the server once nothing has been for
  half an hour. Whatever needs it next starts it again, with its data, in
  about a second. A dev server holds a connection for as long as it runs
  (`local/hold.ts`), so it's never stopped under one. Its connection is
  `app idle watch` in `pg_stat_activity`.
- **Each checkout has its own**, with its data, its port and its log in
  `.postgres/` (ignored by git), so a branch's migration never lands under
  another worktree's code. Its port is picked free the first time and kept
  in `.postgres/port`. **A Mac runs at most 32 of them**, across every
  repo that uses this setup: each holds
  one of macOS's System V shared memory segments, and the 33rd fails to
  start with `could not create shared memory segment: No space left on
  device`. Under `pnpm test` that message is lost: vitest says `No test
  files found` instead. `node source/database/local/server.ts start` shows
  the real one. `pnpm database:stop` in a worktree whose branch has merged
  gives its slot back at once.
- **As root**, as a cloud sandbox's shell may be, Postgres runs as a
  `postgres` user, made if it's missing, since it refuses to run as root,
  with its data in the system's temporary folder.
- **The dev server only ever uses the checkout's database**, whatever
  `DATABASE_URL` says (`appDatabase()`), so it can't reach production's by
  accident.
- **`pnpm preview`** runs the production build (`pnpm build` first) as
  Railway does, `source/node.ts` and all, on the checkout's database, at
  http://localhost:3001. **`pnpm smoke-test`** does it on a new, empty
  database instead, migrating it first, and checks every page and the
  cache headers, as `pnpm check` and CI do (`workbench/scripts/smoke-test.mjs`).

## The verification loop

```bash
pnpm format       # biome: format, lint, organize imports
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest, in Node, against the checkout's own Postgres
pnpm dev          # http://localhost:3000
pnpm smoke-test   # the build (pnpm build first), migrated, started and probed as Railway runs it
pnpm check        # exactly what CI runs, its parts side by side (workbench/scripts/check.sh)
```

**Tests** are `*.test.ts` files under `source/`, run by vitest in Node with
`vitest.config.ts` (not `vite.config.ts`, whose plugins build the app). Put
them in a `tests/` folder beside the code they cover, like
`source/backend/tests/`. Code that queries the database runs against a real
Postgres, in a database of each test's own: `await testDatabase()`
(`source/database/tests/support/database.ts`) copies a template that every
migration was applied to once that run (`setup.ts`, vitest's global setup),
and drops the copy when the test finishes. So a route is tried on real rows
through a Hono app of the test's own, with `testClient()` or
`app.request()`, as `source/backend/tests/health.test.ts` does. The
server is the checkout's own, here and in CI, which the setup starts when
it isn't running.

## What biome enforces — don't hand-manage style

`pnpm format` applies these mechanically. Never spend effort on them — just
run it:

- No semicolons, double quotes, no trailing commas
- 4-space indentation, 80-character line width
- `import type` for type-only imports; imports kept sorted
- `const` over `let` where possible
- Unused variables and imports are errors; `any` is an error
- Markdown and JSON are formatted too

### No committed file may be one `pnpm format` always rewrites

Every committed file is in one of two states: **excluded from the formatter**
in `biome.json`'s `files.includes`, or **committed in the shape the formatter
produces**. Generated files that a tool rewrites on its own (TanStack
Router's `routeTree.gen.ts`) get excluded when they arrive; ones written
once, like drizzle-kit's migration snapshots, are formatted as they're
committed; anything a human
maintains stays formatted. If `pnpm format` on a clean tree reports a file
you didn't touch, fix it in a commit of its own rather than letting it ride
into an unrelated change.

Everything below is judgment biome _can't_ check — it's on you.

## Conventions

### Group related code together with descriptive comments

```typescript
// The posts, newest first, without drafts
const posts = await getPosts()
const published = posts.filter((post) => !post.draft)

// The projects each post links to
const projects = await getProjects()
```

### Use shorthand destructuring

```typescript
// Good:
const [post] = await database.select().from(posts).where(eq(posts.slug, slug))

// Bad:
const post = await database
    .select()
    .from(posts)
    .where(eq(posts.slug, slug))
    .then((rows) => rows[0])
```

### Use explicit logic instead of shorthand

When two paths are alternatives, write both arms:

```typescript
// Good
if (condition) {
    action()
} else {
    fallback()
}

// Bad — is the tail the `else`, or does it run either way?
if (condition) {
    action()
}
fallback()
```

This holds when the `if` arm `return`s or `throw`s too: keep each arm's exit
inside that arm. **The carve-out** is a genuine guard clause — validate and
bail at the top of a function, where nothing below belongs to the other case:

```typescript
// Fine — there is no "else"
if (post.draft) {
    return
}
```

### Never use type assertions unless absolutely required

Type assertions (`as`, `!`) should be used **almost never**. Needing one is
almost always a signal that something is mistyped upstream:

- **Wrong or loose type at the source?** Fix the declaration, the schema, or
  the generic — not the use site.
- **Value needs narrowing?** Use runtime checks (`typeof`, `in`,
  `Array.isArray`, `=== undefined`) or a discriminated union.
- **Data crossing a boundary** (a post's frontmatter, a webhook payload, an
  API response)? Parse it with a zod schema instead of asserting its shape.

The rare legitimate case deserves a comment explaining why it's safe.

### Tagged results for expected failures

Functions that can fail in expected, recoverable ways return an
`OperationResult` instead of throwing. The type is in
`source/utilities/primitives/result.ts`.

```typescript
import type { AsyncOperation } from "@/utilities/primitives/result"

async function getPost(slug: string): AsyncOperation<Post, "not-found"> {
    const [post] = await database
        .select()
        .from(posts)
        .where(eq(posts.slug, slug))

    if (post === undefined) {
        return { ok: false, error: "not-found" }
    } else {
        return { ok: true, data: post }
    }
}
```

Callers handle every outcome explicitly:

```typescript
const found = await getPost(slug)
if (!found.ok) {
    return found
}
const post = found.data
```

- **Always name the `Err` type** — a literal union
  (`"not-found" | "unpublished"`) when the name is the whole story, a
  structured object when the caller needs context.
- **Don't return bare sentinel unions** (`Promise<Post | "not-found">`). They
  collapse when the success type overlaps the sentinel (`string | "missing"`
  _is_ `string`) and can never carry a payload.
- **Not every string union is a failure.** `"active" | "retired"` are peer
  outcomes, not a result.

Reserve `throw` for genuinely unexpected failures — things no caller could
meaningfully handle.

### Logging

There is no telemetry package. Log with `console.*`; Railway keeps each
deployment's logs (`railway logs`, in a checkout linked with `railway link`,
or the Railway MCP server). Two rules regardless of where logs go:

- **Every `catch` logs**, including errors you handle, retry, or deliberately
  ignore. So does every external call's outcome, with its status.
- **Keep the message a static string** and put the variables in an object
  beside it: `console.error("Feed fetch failed", { url, error })`. An
  interpolated message can't be grepped back to its call site and splits one
  failure into many signatures.

### File naming and structure

- **kebab-case** for every file name.
- **The noun is the folder, the verb is the file.** `posts/render.ts`, not
  `render-post.ts` beside `posts/`. Group three or more siblings that share a
  noun into a folder; don't nest preemptively.
- **Keep files under 500 lines.** Split a file when it mixes unrelated
  concerns.

### Spelling

American English throughout — identifiers, comments, strings. `CLAUDE.md`
owns the rule.

## Before you call it done

- **Search before you declare.** Re-declared types, zod schemas, helpers and
  constants are the highest-cost decay, because duplicates diverge silently.
  Import the canonical one, or extend it with `.pick()` / `.extend()`.
- **Dead code** — exports nothing imports, functions whose only caller you
  just deleted.
- **Comments narrating obvious code.** Comments explain non-obvious intent;
  descriptive group comments (above) are the wanted kind.
- **Suppressed errors** — an empty `catch`, a `@ts-expect-error` without a
  reason.
- **Formatting** is biome's job. If style problems survived, the gate didn't
  run.

## Backward compatibility

When changing existing code and nobody mentioned backward compatibility:

- **Other callers?** Refactor them if that's cleaner.
- **Unsure?** Stop and ask.
- Never build in backward compatibility unless explicitly requested.

The one exception is **a published URL**. A page's address may be linked
from emails, ads, other sites and search results, so renaming a slug or
moving a route needs a redirect from the old path.

## Keeping this current

If a convention here fights reality, fix it in place when the correction
is small and certain, and otherwise tell the human what's wrong
(`CLAUDE.md`, "Keep things current as you go").
