# Superforge Starter Template

Your business, in one codebase: a website, an API and a database in one
repository, deployed on Railway, made to be changed with Claude.

**New here? Open this folder with Claude Code and say "start here".** It
follows [START-HERE.md](START-HERE.md): it asks about the business, then
sets the colors, fonts, logo and copy, and writes `PRODUCT.md` and
`DESIGN.md`.

## What's in it

| Part     | What                                                                                  |
| -------- | ------------------------------------------------------------------------------------- |
| Website  | TanStack Start, React and Tailwind, pages prerendered, shadcn's components on Base UI |
| API      | Hono under `/api`, called through a typed client and TanStack Query                   |
| Database | Postgres with Drizzle, migrations checked by squawk and an upgrade test               |
| Workflow | DBOS, for background work that picks up where it stopped, in the same Postgres        |
| Tests    | Vitest on a real Postgres, a database of each test's own                              |
| Deploys  | Railway, as code (`.railway/railway.ts`), from each merge to `main` once CI passes    |

```
source/
  frontend/      the website: routes, components, queries, styles
  backend/       the Hono API under /api, a folder per feature, and its workflows on DBOS
  database/      Postgres through Drizzle: the schema, migrations, this checkout's own Postgres
  utilities/     what both sides share: primitives/ and zod schemas/
  server.ts      Start's server entry: /api to Hono, everything else to Start
  node.ts        the Node server Railway runs: the build's files, then server.ts
public/          static files, like the favicon
workbench/       docs and scripts for working on the repo
.railway/        the Railway project, as code
```

## Develop

```bash
pnpm install
pnpm dev            # http://localhost:3000, on this checkout's own Postgres
pnpm database:seed  # sample rows in it, to try things on
pnpm check          # everything CI runs: biome, the migrations, typecheck, the tests, the build and a smoke test of it
```

There's nothing to set up besides `pnpm install` (Node 22 and pnpm 10): no
Docker and no credentials. `pnpm dev` and the tests run a Postgres of the
checkout's own, from npm (`workbench/writing-code.md`, "Local
development").

Deploys run on Railway when a PR merges to `main`. Setting Railway up is a
one-time job for each copy
([workbench/commit-and-deploy.md](workbench/commit-and-deploy.md),
"Setting up Railway").

Claude (and humans): start with [CLAUDE.md](CLAUDE.md).

## This template

This repository is a GitHub template (Use this template → Create a new
repository), copied from Superforge's production setup with the app code
taken out. It's Superforge Foundation (internal code `starter-template`).
It lives at <https://github.com/superforge-studio/starter-template>, and
its own copy runs on Railway, in the `superforge-starter` project, at
<https://superforge-starter.up.railway.app>. A copy made from it replaces
this section, and the names above, in `START-HERE.md`'s step 5.
