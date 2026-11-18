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

## Unreleased

- **CI tags the template's releases**, machinery: a `release-tag` job in
  `.github/workflows/ci.yml`, after `check` on a push to `main`. In the
  template, it tags a version in `.superforge/superforge.json` that has no
  tag yet, on the commit that set it, and fails on a version with no
  heading here. A copy isn't a GitHub template repository, so the job
  skips there (`github.event.repository.is_template`) and changes nothing.
  How to tell a copy already has it: its `.github/workflows/ci.yml` has a
  `release-tag` job.

Visitors, on Superforge Infra: what visitors view, click and run into on
the site's pages, and what only the server knows, kept by Infra as events,
which superforge.studio's dashboard sums up in its Infra tab and Claude
reads in full through the Superforge MCP. A visitor is asked first, unless
the owner chooses otherwise.

- **The pages' events**, machinery: `source/frontend/visitors/`, a script
  of the app's own, started by the root route from an effect, so never in
  the prerender (`routes/__root.tsx`'s `startVisitors`). It records
  `view` on each page the router resolves (with the referring site and
  the campaign on the first), `leave` (how far down, how long visible),
  `click` on links, buttons and anything with `data-track`, and `error`,
  ten a page; it never keeps a query string, a fragment, a field's value
  or an email address. It sends with `fetch`, as plain text, every five
  seconds and with `keepalive` as the page hides, to
  `/v1/projects/<project_id>/events`, the `project_id` the Superforge
  MCP's `create_project` writes into `.superforge/superforge.json`;
  without one it does nothing. A dev server sends nothing and logs each
  batch with `console.debug`. No file or address holds a word ad
  blockers' lists match. `track()` sends the app's own events and
  `identify()` puts the signed-in person's user ID on them; the dashboard
  (`routes/dashboard/route.tsx`) and signing in and out
  (`queries/auth.ts`) call it. The dashboard is `data-private`, so its
  clicks send no text. Its README has the rest.
- **Consent**, machinery with the owner's setting: `CONSENT` in
  `source/frontend/visitors/consent.ts`. `"ask"`, as it ships: until a
  visitor accepts, and after they decline, nothing is kept on their
  device, and only `view`, `leave` and `error` go, with no IDs. Once
  they accept, a lasting visitor ID, a visit's ID (a new one after 30
  idle minutes) and what couldn't be sent yet are kept in localStorage,
  and their clicks and the app's events go too. `"assume"`: no banner,
  remembered from the first visit.
- **The consent banner**, a starting point:
  `source/frontend/components/site/consent-banner.tsx`, drawn by the root
  route on every page, the dashboard's too, only in a browser and only
  while it asks. A copy may restyle it and reword it in its own voice.
- **Server events**, machinery: `sendEvents` on `Infra`
  (`backend/infra/index.ts`), `POST /v1/events` with the key
  (`client.ts`), checked as Infra checks it and kept by no one in the
  stand-in (`stand-in.ts`, which answers `{ kept: 0 }`, as a test key
  does), with the event's shape in `backend/infra/events.ts` and the
  answers in `answers.ts`. It never throws, and a failure is logged.
  An event's field rules, which the pages share, are in
  `source/utilities/schemas/events.ts`. `INFRA_URL`, Infra's address,
  moves from `backend/infra/client.ts` to `source/utilities/infra.ts`,
  since the pages send there too.
- **The sample event**, a starting point: `signed-up`, with the new user's
  ID, which `backend/auth/routes.ts` sends without waiting on it when a
  sign-in makes someone new (`tellInfraOfSignUp`), so a slow or failing
  Infra never holds signing in up.
- **Docs**: `source/frontend/visitors/README.md`,
  `source/backend/infra/README.md` ("Events"), `START-HERE.md` (step 1's
  question 13, and step 3 sets `CONSENT`), `CLAUDE.md` and `README.md`.

Flags:

- **Owner**: whether to keep the banner: keep `"ask"` if any customers
  are in the EU or the UK, or if they aren't sure (`START-HERE.md`'s
  question 13). The events are kept only once the copy has a
  `project_id` in `.superforge/superforge.json` and its domains are
  listed on the dashboard's Infra tab.
- **A change in how something works**: every object that is an `Infra`,
  like a test's fake of it, needs a `sendEvents`, as
  `backend/auth/tests/routes.test.ts`'s do; and code that imported
  `INFRA_URL` from `backend/infra/client.ts` imports it from
  `@/utilities/infra`.

How to tell a copy already has it: `source/frontend/visitors/consent.ts`
exists, and `Infra` in `source/backend/infra/index.ts` has `sendEvents`.

## 0.3.0 (2026-11-16)

The dashboard, behind sign-in. Everyone who signs in has a role: the
business's own people (`internal`) see everyone who can sign in and the
workflows' runs as they run, and everyone else (`external`) sees their own
account. Who can sign in at all, anyone or only people the team has added,
is the owner's choice, in code.

- **Roles**, machinery: `users.role`, `internal` or `external`, from
  `ROLES` in `source/utilities/schemas/users.ts`, with `INTERNAL_ROLES`,
  the ones that see the business's side of the dashboard. It's text with a
  check made from `ROLES`, not a Postgres enum, so a copy adds a role in
  one list and the migration `pnpm database:generate` writes. The API
  enforces it: `internalOnly` (`backend/auth/signed-in.ts`) answers 403
  `not-internal` to anyone else, whatever a page shows. The session's user
  (`GET /api/auth/session`) now carries `name` and `role`.
- **Who can sign in**, machinery with the owner's settings:
  `source/backend/auth/access.ts`'s `ACCESS`, on `context.var.access`.
  `sign_in: "anyone"` makes someone new `external` at their first sign-in,
  as before; `"listed"` refuses anyone not already added, before Infra is
  asked, 403 `not-listed`. `internal_emails` are `internal` from their
  first sign-in. It ships as anyone, with no internal emails, so a copy
  behaves as 0.2.0 did until its owner sets it (`START-HERE.md`, step 3).
- **The account**, machinery: `/api/account`, a person's name (the new
  `users.name`) and the browsers they're signed in on (the new
  `auth.sessions.user_agent`, kept as each session starts), with signing
  out of one or every other (`backend/account/`).
- **The people**, machinery: `/api/users`, for internal people only:
  everyone who can sign in, adding someone before they sign in, changing a
  role, removing someone, never yourself (`backend/users/`).
- **The workflows' runs**, machinery: `/api/workflows/runs`, a run with
  its steps, and trying a failed or canceled run again from where it
  stopped, read through DBOS's own `listWorkflows`, `listWorkflowSteps`
  and `rewindWorkflow`, never its tables (`backend/workflows/routes.ts`,
  `runs.ts`, `engine.ts`). `context.var.workflows` gains `runs()`,
  `run(id)` and `retry(id)`, which a test's recorded workflows answer too,
  and `defineWorkflow` takes a `title`, what a run is called on screen.
- **The sample workflow**, a starting point: `tell-team-of-sign-up`
  (`backend/users/workflows.ts`), which a sign-in that makes someone new
  starts, and which tells the internal people, in the logs until Infra can
  email. `pnpm database:seed` queues real runs of it for a dev server to
  run (`enqueueFromScript` in `engine.ts`).
- **The dashboard**, a starting point: `source/frontend/routes/dashboard/`,
  drawn in the browser and left out of the prerender (`filter` in
  `vite.config.ts`), in a frame of a bar and a list beside what's chosen
  (`components/dashboard/`): Workflows, with each run's steps drawn as the
  home page's line, live; People; and the account, which is all an
  external person sees. Its queries are `queries/account.ts`, `users.ts`
  and `workflows.ts`. Opening it signed out shows the sign-in form there.
- **The business's mark**, a starting point:
  `components/site/business-mark.tsx`, the logo and name the sign-in page
  and the dashboard share, in place of the sign-in page's own header. The
  sign-in page, once someone's signed in, links to the dashboard.
- **The home page's line**, a starting point: the dashboard is a built
  stop on it, linking to `/dashboard`, and the line now ends at the
  database (`components/welcome/`). A copy that deleted the folder leaves
  this out.
- **Seeds**: the sample users have names and roles (two internal, among
  them `ada@example.com`), and their sessions browsers.
- **Docs**: `CLAUDE.md`, `README.md`, `START-HERE.md` (who signs in, the
  team's emails), `workbench/writing-code.md` ("Roles and who can sign
  in", screens behind sign-in, `internalOnly`), and
  `backend/workflows/README.md` ("Reading runs", "The sample").

Flags:

- **Schema**: three new columns, all safe for the version still serving:
  `users.name` (text, null), `users.role` (text, not null, default
  `'external'`, with a check that it's one of `ROLES`) and
  `auth.sessions.user_agent` (text, null). The copy's own migration, from
  `pnpm database:generate --name=roles-names-and-browsers`, makes them;
  squawk asks why the check needn't be `NOT VALID`, so above its
  `ADD CONSTRAINT` line write:

  ```sql
  -- users holds the people who can sign in, a few thousand rows at most, and
  -- every one fits, since role was just added with its default
  -- squawk-ignore constraint-missing-not-valid
  ```

  Every user the copy has becomes `external`, so in the same migration,
  make its own people internal, by the addresses the owner gives
  (below):

  ```sql
  UPDATE "users" SET "role" = 'internal' WHERE "email" IN ('owner@example.com');
  ```
- **Owner**: who can sign in, and the business's own people's addresses,
  for `ACCESS` in `source/backend/auth/access.ts`, and for the update
  above. Until someone is internal, no one sees the people or the
  workflows.

How to tell a copy already has it: `source/frontend/routes/dashboard/route.tsx`
exists, and `schema.ts`'s `users` has a `role`.

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
