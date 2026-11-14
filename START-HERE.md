# Start here

This codebase is a starting point: a website, an API and a database, set up
and deployed, with nothing of anyone's in it yet. This file is how it
becomes a business's own. It's written for Claude, which follows it with
the person who owns the business.

**Claude: follow these steps in order, in one session.** Ask the questions
in step 1 in plain words, a few at a time, and wait for the answers. Don't
invent anything the business hasn't told you: when something isn't
decided, choose a sensible default, say what you chose, and move on. When
every step is done, delete this file and the first section of `CLAUDE.md`,
which points here.

## 1. Ask about the business

Ask for each of these. The answers go into PRODUCT.md and DESIGN.md (step
4), so keep them in the owner's words.

1. **Its name**, as customers see it written.
2. **What it does**, in a sentence or two: what it sells or provides, and
   to whom.
3. **Who its customers are**, and what they come to it for.
4. **How it sounds**: three or four words for its voice (like "warm,
   plain, local" or "precise, expert, calm"), and anything it never says.
5. **Its colors**: hex codes, a link to its brand guide, or a description
   ("the navy and orange on our trucks"). One main color is enough.
6. **Its fonts**, if it has any. If not, offer two or three from
   [Fontsource](https://fontsource.org) that fit the voice, with a reason
   for each, and let the owner pick.
7. **Its logo**: ask for the file (SVG best, else a PNG at least 512 pixels
   square) to be put in `public/`. Without one, a simple mark in the main
   color stands in.
8. **How rounded things should look**: sharp, a little rounded, or very
   rounded (this sets `--radius`).
9. **What the home page should say for now**: a line about the business
   and what visitors should do next (call, book, email, or just know it's
   coming).
10. **Its website address**, if it has a domain it wants this on.

## 2. Make it look like the business

All of the look lives in `source/frontend/styles.css`, as shadcn's theme
tokens, which every component in `source/frontend/components/primitives/`
is drawn with ([shadcn's theming](https://ui.shadcn.com/docs/theming)).

- **Colors.** Turn the business's colors into the tokens, in OKLCH, for
  both light and dark (the dark ones are in the `prefers-color-scheme`
  media query). The main color is `--primary`, with a
  `--primary-foreground` that reads on it at a contrast of at least 4.5:1;
  `--ring` and `--sidebar-primary` usually follow it. Keep the neutrals
  (`--background`, `--foreground`, `--muted`, `--border`) neutral or
  tinted only slightly toward the main color, and check every text and
  background pair for contrast in both modes.
- **Fonts.** `pnpm add @fontsource-variable/<name>` (or
  `@fontsource/<name>` for a font with no variable version), replace the
  Geist import at the top of `styles.css`, and set `--font-sans` (and
  `--font-heading` if headings get their own). Remove
  `@fontsource-variable/geist` from `package.json` if nothing uses it.
- **Corners.** Set `--radius`: about `0.25rem` for sharp, `0.625rem` for a
  little rounded, `1rem` for very rounded.
- **Logo and favicon.** Put the logo in `public/`, replace
  `public/favicon.svg` with the mark (an SVG with a `<title>`), and
  replace the placeholder square in `source/frontend/routes/index.tsx`'s
  header with the logo.

Use the `impeccable` skill for this step and the next: it knows how to
turn a brand into a theme that holds together.

## 3. Write the home page

Replace `source/frontend/routes/index.tsx`'s placeholder with the
business's own page: its name, the line from step 1, and what visitors
should do next. Keep it one page for now; more pages are routes under
`source/frontend/routes/`, linked from the home page. Then set the page's
title and description in `source/frontend/routes/__root.tsx`'s `head`.
The health check's status line on the placeholder page is there to show
the deploy works; drop it from the business's page, and keep
`source/backend/health.ts`, which Railway's healthcheck needs.

## 4. Write PRODUCT.md and DESIGN.md

These are what every later change reads first (`CLAUDE.md`'s hooks), so
write them for someone who has never met the business.

- **`PRODUCT.md`**: who the business is and who it serves, what it sells,
  its voice and the words it never uses, what the site is for today, and
  any commitments (what it never claims, what it never names).
- **`DESIGN.md`**: the visual system as `styles.css` now sets it: each
  color token with its value and what it's for, the fonts and where each
  is used, the radius, the logo and how it's used, and the rules that keep
  it consistent (like which color is only for the main action).

## 5. Make the names the business's own

The codebase is called `superforge-basic` in a few places. Rename it to a
short, lowercase name for the business (like `acme-plumbing`):

- `name` in `package.json`.
- The project, the service, the repository and the service domain in
  `.railway/railway.ts` (`github("<owner>/<repository>", …)` is this
  repository on GitHub, as `git remote get-url origin` shows it).
- `README.md`: its title and first paragraph, and the "This template"
  section, which goes.

## 6. Check it, and ship it

```bash
pnpm format && pnpm check
```

Then `pnpm dev` and look at the home page at http://localhost:3000, on a
computer's width and a phone's, in light and dark. When it's right, delete
this file and `CLAUDE.md`'s first section, commit on a branch, and follow
`workbench/commit-and-deploy.md` to put it on Railway: its "Setting up
Railway" section is the one-time setup, which needs the owner for a token
and, if there's a domain, its DNS.
