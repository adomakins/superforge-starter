# Infra

Superforge Infra is the backend services this app runs on, at
`https://infra.superforge.studio/v1`. This folder is the one wrapper the
app calls it through: a route or a workflow's step calls
`context.var.infra`, never a bare `fetch` to Infra
(`workbench/writing-code.md`, "A call to an outside service"). For now
Infra does one thing for the app: sign-in.

## Sign-in

There's no password. A visitor proves an email address is theirs by
bringing back what Infra emailed it, and the app keeps its own users and
sessions (`backend/auth/`). Infra never keeps anyone's users, only the
codes waiting to be used. **The app's server calls Infra, never the
browser**: the key is a secret, and the pages only ever call the app's
own `/api`.

1. The visitor enters their email on `/sign-in`. `POST /api/auth/start`
   calls Infra's `POST /v1/sign-in/start` with it, the visitor's IP
   (Railway's `X-Real-IP`) and the app's origin.
2. Infra emails a six-digit code, and a link back to the app's
   `/sign-in#<token>` when the origin is one of the project's domains (or
   localhost), from `sign-in@system.superforge.studio` under the project's
   name. A code and a link each work once, for 15 minutes, and a code for
   five tries.
3. The visitor types the code, or opens the link, whose page posts the
   token from the fragment. `POST /api/auth/verify` calls Infra's
   `POST /v1/sign-in/verify` with either, and Infra answers the email.
4. The app finds or makes the user by that email, and starts a session in
   its own Postgres (`backend/auth/sign-in.ts`).

What the wrapper answers, and what the routes under `/api/auth` make of it:

| Infra answers                                     | The wrapper's result               | `/api/auth` answers         |
| ------------------------------------------------- | ---------------------------------- | --------------------------- |
| 200, the email went out                           | `ok`, with `expires_at`, `test`    | 200                         |
| 429 `too-soon`, a minute apart                    | `too-soon`, `retry_after`          | 429, with `Retry-After`     |
| 429 `too-many`, an hour's limit                   | `too-many`, `limit`, `retry_after` | 429, with `Retry-After`     |
| 502 `not-sent`, nothing counted                   | `not-sent`                         | 502                         |
| 200 `{ email }`, verified                         | `ok`, the email                    | 200, the user, and a cookie |
| 400 `wrong-code`, `attempts_left`                 | `wrong-code`                       | 400                         |
| 400 `no-code` or `no-link`                        | `no-code`, `no-link`               | 400                         |
| 401 (a key it refused), anything else, or nothing | `unavailable`, logged              | 503                         |

Infra's limits, an hour each, per project: five emails to one address, a
minute apart; 20 from one visitor's network; 300 from the project. They
hold back abuse, not a busy day, and a refusal says when asking again can
work. A test key's sign-ins have none.

## Keys

Each copy of this codebase is a **project** on Infra, made on
superforge.studio's dashboard (the Infra tab), which also lists the
**domains** its sign-in links may go to: add the app's Railway address
and its custom domain there. A project has two kinds of key, each shown
once as it's made:

| Key                       | Where it goes                                                              | Its sign-ins                                                 |
| ------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Secret key, `sf_secret_…` | `INFRA_SECRET_KEY` on the app's service in Railway (`.railway/railway.ts`) | sent by email, for real                                      |
| Test key, `sf_test_…`     | `INFRA_TEST_KEY` in the checkout's `.env` (`.env.example`)                 | not sent: Infra answers the code, which the dev server shows |

Which one the server uses is decided once, as it starts (`choose.ts`):

- **A build** (production, `pnpm preview`) takes only a secret key.
  Without one, or with a test key in its place, every sign-in answers 503
  and the logs say `Sign-in is down`. It never falls back to the stand-in,
  which would show anyone's code on the page.
- **A dev server** takes only a test key, from the shell or the checkout's
  `.env`, so it can't email real people. A git worktree with no `.env` of
  its own reads its main checkout's, so the key is set once per computer.
- **A dev server with no test key**, as right after a clone, uses the
  stand-in (`stand-in.ts`): Infra's test mode in memory, with nothing to
  set up. Signing in works the same, without Infra.
- **The tests** always use the stand-in (`backend/tests/support/api.ts`),
  so they never reach Infra.

`INFRA_URL` points the server at another Infra, like a Superforge
checkout's own dev server (`http://infra.localhost:3002/v1`), to work on
both at once.

## In this folder

- `index.ts`: `Infra`, what the app asks of it, its results, and
  `appInfra()`, the server's.
- `answers.ts`: what Infra answers, as zod schemas, which `index.ts`'s
  types come from.
- `client.ts`: Infra over HTTP with a key, its answers parsed with them.
  No call is retried: a second start would send a second email.
- `stand-in.ts`: Infra's test mode, in memory.
- `choose.ts`: which of them the server uses, and reading a checkout's
  `.env`.

To check a key from a terminal, `GET /v1/project` answers its project and
its mode, `live` or `test`:

```bash
curl -H "Authorization: Bearer $INFRA_SECRET_KEY" https://infra.superforge.studio/v1/project
```
