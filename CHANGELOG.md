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

## 0.1.0 (not tagged yet)

The first release. A copy made from it starts here, so there's nothing to
update from.

- **Releases begin**: `.superforge/superforge.json` (which template a copy
  came from, and its version), this changelog, and
  `workbench/updating.md`, how a copy takes a later release.
- **The license**: MIT (`LICENSE`).
- **CI in a new copy**: `railway-apply` skips with a notice until the
  repository has its `RAILWAY_TOKEN` secret, so a copy's first commits
  don't fail before Railway is set up.
