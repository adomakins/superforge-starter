# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository. It stays deliberately thin: only universal orientation lives here. Task-specific depth lives in `workbench/`, pulled in on demand via the hooks below.

## First: is this codebase someone's yet?

**If `PRODUCT.md` doesn't exist, the codebase hasn't been made anyone's yet.** Read `START-HERE.md` and follow it before anything else: it asks about the business, then sets the theme, the copy and the names, and writes `PRODUCT.md` and `DESIGN.md`. Once `PRODUCT.md` exists, `START-HERE.md` has done its job and this section can go.

## Workbench

Task-specific docs live as Markdown files at the top level of `workbench/`. Subfolders hold other kinds of things: helper scripts live in `workbench/scripts/`. **Check this list before starting work — when a hook matches your task, read that doc first.** Match hooks on intent, not keywords. When several hooks match, read all of them.

- **Writing or editing any code** → read `workbench/writing-code.md` first. Where code lives (`source/frontend`, `backend`, `database` and `utilities`, and what may import what), the data and its migrations, local development on the checkout's own Postgres, the conventions biome can't enforce (type assertions, tagged result types, explicit branches, file structure), and the verification loop.
- **Designing or changing anything a person sees** (a page, a component's look, its layout, motion or copy) → read `PRODUCT.md` and `DESIGN.md` first, and use the `impeccable` skill (`.claude/settings.json` enables its plugin). PRODUCT.md holds who the business serves and how it sounds; DESIGN.md holds the visual system: its colors, type and shapes, as `source/frontend/styles.css` sets them.
- **Committing, opening a PR, or shipping anything** → read `workbench/commit-and-deploy.md` first. **`main` only changes through a pull request, and merging one deploys to production.** Work on a branch per task, and push it and open the PR only when you are asked to ship. The commit gate, the push gate, how a deploy reaches Railway, its variables and secrets, domains, and Railway's CDN.
- **Reading or fetching any web page or online docs** → read `workbench/read-webpages.md` first. The Jina Reader one-liner and the HTTP-200-but-empty trap.

### Write in American English

**Everything you write here is American English**: code, comments, docs, UI copy, commit messages. `behavior`, `color`, `canceled`, `organize`, `judgment`, `toward`, `gray`, `catalog`. (If the business writes to its customers in another variety of English, PRODUCT.md says so, and the site's copy follows PRODUCT.md.)

### Write names in full

**Name things with whole words**: variables, functions, files, folders, bindings and scripts. `database`, not `db`; `utilities`, not `utils` or `lib`; `context`, not `ctx`; `error`, not `err`. Exceptions: names a tool or library sets (`vite.config.ts`, `drizzle.config.ts`, Hono's `c`, React's `props`, shadcn's generated primitives), and acronyms that are the word (`id`, `url`, `api`, `html`).

### Keep things current as you go

There is no separate planning, reporting, or review phase, and no status docs in the repo. Work the task; keep these true as you finish:

1. **This file** — if you add, remove or fundamentally change an area of the repo listed under [Project Architecture](#project-architecture), update the list in the same change.
2. **The READMEs** — if your change affects what a directory's `README.md` describes, update it in the same change.
3. **The PR**, when you were asked for one — say what changed and why, and anything the human has to do around the merge.
4. **The workbench docs** — if one you used is stale or wrong, fix it in place when the fix is small and certain; otherwise tell the human what's wrong.

## Project Architecture

This is **one TanStack Start app, in a single pnpm package**, deployed as one Node server on Railway, on one Postgres. There is no monorepo: the pages and the API ship together. A part that needs to deploy on its own later becomes a second Railway service in the same project, started from this same package. **It's headless**: every database read and write goes through the Hono API under `/api`, never a page, a loader or a server function (`workbench/writing-code.md`, "Headless").

An `AGENTS.md` at the root points Codex and Cursor here.

- **`source/server.ts`** — Start's server entry, the one Vite builds into `output/server/` with everything it imports: `/api/*` to Hono, everything else to TanStack Start.
- **`source/node.ts`** — the Node server Railway runs (`pnpm start`, after `pnpm build`): the client build's files first, every prerendered page among them, with what browsers and Railway's CDN may cache of each, then the built `server.ts` for everything else. Node runs it from source, so it imports only packages and the build.
- **`source/frontend/`** — the website: TanStack's `router.tsx` (with the query client on its context) and generated `routeTree.gen.ts`, `styles.css` (Tailwind and shadcn's theme tokens, light and dark following the device), `routes/` (one file per page; the home page, `index.tsx`, is prerendered), `components/` (shadcn's primitives, on Base UI, in `primitives/`, configured by `components.json` at the root) and `queries/` (TanStack Query's options, through the API's typed client, like `health.ts`).
- **`source/backend/`** — the Hono API under `/api` (`index.ts`, which mounts each group of routes), `health.ts` (`/api/health`, which Railway's healthcheck calls and which needs the database), and `client.ts`, the typed client the frontend calls it with. `frontend/` imports only `client.ts` and types from here.
- **`source/database/`** — Postgres, through Drizzle: `schema.ts` (the source of truth, and its four Postgres schemas: `public` for the business's data, `auth` for who can get in, `internal` for the machinery, and `dbos`, DBOS's own; no tables yet), `migrations/` (drizzle-kit's, applied before each deploy by `migrate.ts`, `pnpm database:migrate`), `index.ts` (`connect()` and `appDatabase()`, the server's: `DATABASE_URL`, or this checkout's own in a dev server), `local/` (this checkout's own Postgres, which `pnpm dev`, the tests and the `database:*` scripts use: a Postgres 18 from npm rather than Docker, one per checkout in `.postgres/`, which stops itself once idle for half an hour), `seed/` (the sample rows `pnpm database:seed` writes), `storage/` (the `Storage` bucket, for files: `files.ts`'s `Storage` class has a getter for each kind of file, a folder in the bucket with its key checked by zod, its path and its format (`kind.ts`: zod-checked JSON, text or bytes), as `c.var.storage` in a route, kept through Railway's S3 API in a build and in `.storage/` in a dev server; no kinds yet), and `tests/` (a database of each test's own, the upgrade test, and the bucket's bytes in memory). Server-only.
- **`source/utilities/`** — what both sides share.
- **`source/globals.d.ts`** — types every file uses without importing them: `OperationResult` and `AsyncOperation`, for expected failures.
- **`public/`** — static files served as-is from the site root, like `favicon.svg`.
- **`workbench/`** — docs and scripts for working on the repo (above). `scripts/check.sh` is `pnpm check`, whose two parts, `code` and `tests`, it runs side by side as CI does; `check-migrations.sh` and `upgrade-test.sh` check the migrations; `smoke-test.mjs` runs the build as Railway does and probes it; `seed.mjs` runs the seed.
- **`.github/workflows/ci.yml`** — CI: `code` (with the smoke test) and the tests in two shards, side by side, behind the `check` gate, on every PR and push to `main`; then on a push, `railway config apply`, the one job with production's Railway token. Railway deploys each push to `main` itself, once this whole run passes. `dependabot.yml` opens a PR a month for what's out of date.
- **`.railway/`** — the Railway project as code (`railway.ts`): the app service, its build, pre-deploy migrations, start, healthcheck, CDN and variables, the Postgres database with its point-in-time recovery bucket, `Postgres-PITR` (restoring it is in `workbench/writing-code.md`), and the `Storage` bucket, whose S3 credentials the app gets as `STORAGE_*`. CI applies it; change Railway there, not in the dashboard.
- **`START-HERE.md`** — the onboarding that makes this codebase a business's own. `PRODUCT.md` and `DESIGN.md`, which it writes, hold the business and its look.

### Keeping this list current

If you add, remove, rename, or fundamentally change the purpose of an area above, **update the list in the same change.**

## READMEs

Directory-level `README.md` files own the deep context. Read one before changing anything in its directory, keep it current in the same change, and add one only when a directory's context can't be inferred from the code.

## Before Committing, And Before Shipping

**A local commit is a checkpoint**: `pnpm format`, plus `pnpm typecheck` if you touched code.

**A push or a PR runs the full gate:**

```bash
pnpm format && pnpm check
```

`pnpm check` is exactly what CI runs, its parts side by side as CI's jobs run them (biome, the migration check, the typecheck, the tests against Postgres with the upgrade test, the build with its prerender, and the smoke test of the build). The tests start the checkout's own Postgres, which `pnpm install` brought. Merging to `main` deploys to production. Everything else about shipping lives in `workbench/commit-and-deploy.md`.
