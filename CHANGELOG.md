# Changelog

Every release of this template, newest first. Each one is a git tag on the
template's `main`, `v` and its version (`v0.1.0`), and the tags are the
list of versions. `.superforge/superforge.json` says which release a copy
is on.

These notes are written for the agent that updates a copy
(`workbench/updating.md`), which reads every release between the copy's
version and the latest before it applies any of them. A copy keeps this
file as its updates leave it, so don't edit it in a copy: the copy's own
history is its git log.

In the template, a change merged since the last release has its notes
under `## Unreleased` at the top, until the release that ships it gives
that heading its version and day (`## 0.2.0 (2026-12-01)`).

## How a release is written

Each release says:

- **What changed, and why**, a part at a time, naming the files.
- **Machinery or a starting point**, for each part. Machinery is the
  setup every copy runs on (CI, the checks, the local Postgres, workflows,
  the Railway project's shape), so a copy takes it as the template has it.
  A starting point is something the owner is expected to make their own
  (the home page, the theme, an example feature), so an update offers the
  change and keeps the owner's version where they've changed it.
- **Flags**, when they apply:
  - **Schema**: `schema.ts` changed. The update applies the change and
    generates the copy's own migration (`pnpm database:generate`), since
    the template's migration files can't be copied (the update skips
    them). Any SQL written by hand is given here, to go in that migration.
  - **Variable** or **Secret**: a new variable on the app's Railway
    service. A secret's value is the owner's to set in Railway's
    dashboard before the update merges.
  - **Railway**: a change to `.railway/railway.ts` that costs money, or
    that needs a destructive apply.
  - **Owner**: a step only the owner can take, like a token or a DNS
    record.
- **How to tell a copy already has it**: a file, a line or a command's
  output that shows the change is there, for a copy that took some of it
  by hand.

A patch release (`0.1.1`) fixes something; a minor release (`0.2.0`) adds
or changes something. Until `1.0.0`, a minor release may also change how
something already there works, which its notes flag.

## 0.2.0 (2026-11-15)

Sign-in, through Superforge Infra. A customer or someone on the staff
enters their email at `/sign-in`, Infra emails them a six-digit code and a
link, and the app keeps the user and their session in its own Postgres: no
passwords, and no email provider of the owner's own. It's the first thing
the app calls Infra for.

- **Signing in, in the API**, machinery: `source/backend/auth/`. Its
  routes are `POST /api/auth/start`, `/verify` and `/sign-out`, and
  `GET /api/auth/session`, who's signed in. `signedIn` and `maybeSignedIn`
  (`signed-in.ts`) put the user on `context.var.user`, and nothing else
  reads the `session` cookie or the sessions. Sessions last 30 days from
  their last use, renewed at most once a day.
- **Infra**, machinery: `source/backend/infra/`, the one wrapper the app
  calls it through, on `context.var.infra`. A build calls Infra with
  `INFRA_SECRET_KEY` and nothing else; a dev server with a test key from
  the checkout's `.env` (`.env.example`), or, without one, an in-memory
  stand-in that emails nothing and shows the code on the page, which the
  tests always use. Its README has the calls and the keys.
- **The users and their sessions**, machinery: `users` in `public` and
  `sessions` in `auth` (`schema.ts`), with sample rows in
  `seed/users.ts`. `writing-code.md`'s rule for the Postgres schemas
  changes to match: the users are the business's own data, which its
  tables point at, and `auth` holds what lets someone in, the sessions and
  API tokens later. The sign-in codes are Infra's.
- **The sign-in page**, a starting point: `routes/sign-in.tsx`, with its
  form in `components/site/sign-in-form.tsx` and its queries in
  `queries/auth.ts`. It's prerendered whatever links to it (`pages` in
  `vite.config.ts`), since the email's link lands there. The link signs in
  only once the visitor presses "Finish signing in", so a mail scanner that
  opens it, even one that runs the page's script, spends nothing. Its header says
  "Your business" beside the favicon, as the template's home page did: a
  copy puts its name and logo there (`START-HERE.md`, steps 2 and 3).
- **Failures**, machinery: the failure shape gains an optional
  `retry_after` (`utilities/schemas/failures.ts`), `failure()` takes
  details beside the reason, like a 429's, and `queries/failures.ts` has
  `FailedRequest`, which a mutation throws, and `failureOf`. A body that
  isn't JSON is answered 400 `invalid` rather than 500 `unexpected`
  (`answerUnexpected` in `backend/failures.ts`).
- **Another site's forms**, machinery: the API refuses a form posted from
  another site, 403 `forbidden` (`csrf()` in `backend/index.ts`), so a
  page elsewhere can't sign anyone out. JSON, and a request with no
  `Content-Type`, are left alone.
- **The home page's line**, a starting point: Sign-in is a stop on it,
  linking to `/sign-in` (`components/welcome/`). A copy that deleted the
  folder leaves this out.
- **The smoke test**, machinery: it checks that a build without a secret
  key refuses sign-in (503) rather than using the stand-in, which would
  show anyone's code on the page.
- **Docs**: `CLAUDE.md`, `README.md`, `START-HERE.md`,
  `workbench/writing-code.md` (signing in during development, `signedIn`,
  the schemas' rule), `workbench/commit-and-deploy.md` ("Setting up
  Railway", step 6: the project on Infra, its domains and its keys), and
  `workbench/updating.md`, which leaves `routeTree.gen.ts` out of an
  update and builds it again.

Applying it: this is the first release that adds a page, and a copy's
`updating.md` is still 0.1.0's, so leave
`source/frontend/routeTree.gen.ts` out of the diff too
(`':(exclude)source/frontend/routeTree.gen.ts'`), and run `pnpm build`
after `pnpm install`, which writes it again with `/sign-in` and the copy's
own pages.

Flags:

- **Schema**: two new tables, `users` (in `public`) and `sessions` (in
  `auth`), with a foreign key from `sessions.user_id` to `users.id` and an
  index on it. The copy's own migration, from `pnpm database:generate
  --name=users-and-sessions`, makes them; nothing is written by hand. A
  copy that already has a table named `users` needs the owner's call on
  how the two become one before this applies.
- **Secret**: `INFRA_SECRET_KEY` on the app's service, declared with
  `preserve()` in `.railway/railway.ts`. Until the owner sets it, the site
  works and sign-in answers that it's down (the logs say `Sign-in is
  down`).
- **Owner**: on superforge.studio's dashboard, the Infra tab, a project
  for the app, its domains (its Railway address and its custom domain),
  and a secret key, which the owner sets in Railway
  (`workbench/commit-and-deploy.md`, "Setting up Railway", step 6). A test
  key in `.env` is optional.

How to tell a copy already has it: `source/backend/auth/routes.ts`
exists, and `.railway/railway.ts` declares `INFRA_SECRET_KEY`.

## 0.1.0 (2026-11-15)

The first release. A copy made from it starts here, so there's nothing to
update from.

- **Releases begin**: `.superforge/superforge.json` (which template a copy
  came from, and its version), this changelog, and
  `workbench/updating.md`, how a copy takes a later release.
- **The license**: MIT (`LICENSE`).
- **Design guidance without a plugin**: the template no longer enables
  the impeccable plugin in `.claude/settings.json`, which every owner had
  to trust and which asked START-HERE's questions again.
  `workbench/designing.md` carries the design rules instead, for any
  agent, and says how to install impeccable for a full redesign.
- **CI in a new copy**: `railway-apply` skips with a notice until the
  repository has its `RAILWAY_TOKEN` secret, so a copy's first commits
  don't fail before Railway is set up.
- **The home page**, a starting point: the app as a line, a stop for each
  part (the website, the API, Storage and the workflows, the database),
  drawn in the theme's main color, with the health check running down it
  and what to tell Claude where it fails, the parts still to come as
  dashed stops, and the next steps as sentences to say to Claude
  (`routes/index.tsx`, `components/welcome/`). `queries/health.ts`'s
  `healthQuery` answers the round trip's time beside the status. START-HERE
  replaces the page and deletes `components/welcome/`.
