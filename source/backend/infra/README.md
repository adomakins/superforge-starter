# Infra

Superforge Infra is the backend services this app runs on, at
`https://infra.superforge.studio/v1`. This folder is the one wrapper the
app calls it through: a route or a workflow's step calls
`context.var.infra`, never a bare `fetch` to Infra
(`workbench/writing-code.md`, "A call to an outside service"). For now
Infra does two things for the app: sign-in, and keeping its events, what
happened in it, for the owner's dashboard.

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
3. The visitor types the code, or opens the link and presses "Finish
   signing in", which posts the token from the fragment: never as the page
   loads, so a mail scanner that opens the link spends nothing. `POST /api/auth/verify` calls Infra's
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

## Events

Infra keeps what happened in the app, for the owner: superforge.studio's
dashboard sums it up in its Infra tab (visitors, top pages, where they
came from, errors, sign-ins), and Claude reads it in full through the
Superforge MCP. **Every event reaches Infra from the app's server, with
its key**: the pages send theirs to the app's own address, never to
Infra. Only a secret key's events are kept: a test key's, and the
stand-in's, are checked and dropped.

### The pages': `sendVisit`

The pages' script (`frontend/visitors/README.md`) posts its batches to
the app's own `POST /api/visits` (`backend/visits/routes.ts`), which adds
who the visitor is and calls `context.var.infra.sendVisit`,
`POST /v1/visits` with the key:

```ts
context.var.infra.sendVisit({
    mode: "remember",
    visitor: {
        id: "2f1c8e64-7b5a-4f2e-9c3d-8a6b1e0f4d27",
        consent: "unasked",
        user: null,
        ip: "203.0.113.9",
        user_agent: "Mozilla/5.0 (iPhone; …)"
    },
    sent_at: 1763445600000,
    events: [
        { name: "view", at: 1763445598000, path: "/pricing", properties: {} }
    ]
})
```

- `mode` is `VISITOR_MODE` (`utilities/visitors.ts`): `remember`,
  `ask-in-eu`, `ask` or `never`.
- `visitor.id` is the ID in the visitor's `visitor` cookie, or a new
  UUID the app would set; null in `never` mode.
- `visitor.consent` is their answer to the banner, from the
  `visitor_consent` cookie: `unasked`, `given` or `declined`.
- `visitor.user` is the signed-in user's ID, from the app's own session,
  or null. Infra keeps it only of a visitor it remembers.
- `visitor.ip` is Railway's `X-Real-IP` (`auth/visitor.ts`), for their
  country and to count a visitor who isn't remembered, and
  `visitor.user_agent` their `User-Agent`, for bots and their device.
  Infra keeps neither.
- `sent_at` and `events` are the page's batch as it sent it: at most 100
  events, in at most 64 KB (`utilities/schemas/visits.ts`).

Infra decides, by the mode, the answer and the country, whether the app
remembers the visitor and whether the page asks them:

| `mode`      | Remembered                                                                      | Asked                   |
| ----------- | ------------------------------------------------------------------------------- | ----------------------- |
| `remember`  | Everyone who hasn't declined                                                    | Nobody                  |
| `ask-in-eu` | As `ask` where GDPR applies, or the country is unknown; as `remember` elsewhere | As `ask`, there         |
| `ask`       | Whoever gave their consent                                                      | Whoever hasn't answered |
| `never`     | Nobody                                                                          | Nobody                  |

| Infra answers                                     | The wrapper's result                   | `/api/visits` does                                                      |
| ------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------- |
| 200 `{ kept, remembered, ask }`                   | `ok`, with `kept`, `remembered`, `ask` | Sets or renews `visitor` when remembered, clears it when not; `{ ask }` |
| 400 `invalid`, the `fields` that failed           | `invalid`, `fields`, logged            | `{ ask: false }`, logged, no cookie changed: the batch is lost          |
| 413 `too-large`                                   | `too-large`, `limit`, logged           | The same                                                                |
| 401 (a key it refused), anything else, or nothing | `unavailable`, logged                  | The same                                                                |

A batch that reached the app's server is never sent again, since events
sent twice are kept twice. The stand-in answers by the same table, for a
visitor whose country is unknown, as everyone's is there, so
`ask-in-eu` asks as `ask` does; it keeps nothing, and in a dev server it
logs each batch.

### The server's: `sendEvents`

The server sends what only it knows, like a sign-up, a booking or a
payment, through `context.var.infra.sendEvents`, `POST /v1/events` with
the key:

```ts
context.var.infra.sendEvents([
    { name: "booked-a-call", user: user.id, properties: { plan: "monthly" } }
])
```

An event is a `name`, lowercase words joined by hyphens, and whatever's
known of it: `at`, a `Date`, now when it's left out; `user`, the app's own
ID for whoever did it, **never their email** (Infra keeps no app's users);
`path`; and `properties`, flat, at most 32, each a string of at most 1,000
characters, a number, a boolean or null. At most 100 a call, in at most
64 KB (`events.ts`).

| Infra answers                                     | The wrapper's result         |
| ------------------------------------------------- | ---------------------------- |
| 200 `{ kept }`, `0` with a test key               | `ok`, with `kept`            |
| 400 `invalid`, the `fields` that failed           | `invalid`, `fields`, logged  |
| 413 `too-large`                                   | `too-large`, `limit`, logged |
| 401 (a key it refused), anything else, or nothing | `unavailable`, logged        |

**An event is never worth failing a request over.** Where a person is
waiting, send it without waiting on it, and log a failure: `sendEvents`
never throws, and it isn't retried, since events sent twice are kept
twice. The template's one, `signed-up`, goes when a sign-in makes
someone new, with their user's ID (`tellInfraOfSignUp` in
`backend/auth/routes.ts`). The stand-in checks events as Infra does and
keeps none, as a test key's are, so a test that sends a wrong one fails.

Infra keeps each sign-in it verifies as a `sign-in` event of its own, so
the app needn't send one.

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

A test key's events are checked and none is kept, the pages' too, which
go through the server like everything else.

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
both at once; without it, the server calls the real one (`INFRA_URL` in
`client.ts`).

## In this folder

- `index.ts`: `Infra`, what the app asks of it, its results, and
  `appInfra()`, the server's.
- `answers.ts`: what Infra answers, as zod schemas, which `index.ts`'s
  types come from.
- `events.ts`: an event from the server, checked as Infra checks it, with
  the field rules the pages share (`utilities/schemas/events.ts`).
- `visits.ts`: a batch of a page's events, with its visitor and the
  app's mode, checked as Infra checks it.
- `client.ts`: Infra over HTTP with a key, its answers parsed with them.
  No call is retried: a second start would send a second email, and
  events sent again are kept twice.
- `stand-in.ts`: Infra's test mode, in memory, which answers a page's
  events by the app's mode as Infra answers a visitor it can't place.
- `choose.ts`: which of them the server uses, and reading a checkout's
  `.env`.

To check a key from a terminal, `GET /v1/project` answers its project and
its mode, `live` or `test`:

```bash
curl -H "Authorization: Bearer $INFRA_SECRET_KEY" https://infra.superforge.studio/v1/project
```
