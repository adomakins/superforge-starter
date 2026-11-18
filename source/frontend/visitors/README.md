# Visitors

What visitors view, click and run into on the site's pages, sent to
Superforge Infra as events. They show up on superforge.studio's
dashboard, in the Infra tab (visitors, top pages, where people came
from, errors, sign-ins), and in full to Claude through the Superforge
MCP, which can answer an owner's questions about them. The app's server
sends what only it knows through the Infra wrapper
(`backend/infra/README.md`, "Events").

It's a small script of the app's own, not a third party's, and it's
named so ad blockers leave it alone: no file, folder or address here
holds `analytics`, `track`, `collect`, `pixel` or `beacon`, and it sends
with `fetch`, never `navigator.sendBeacon`, which blockers refuse to
another site.

## When it runs

- **Only in a browser.** The root route starts it from an effect
  (`routes/__root.tsx`), which never runs in the prerender, and every
  function here does nothing on the server.
- **Only once the app has an Infra project**: the `project_id` in
  `.superforge/superforge.json`, which the Superforge MCP's
  `create_project` writes. Without one the script and the banner stay
  off.
- **A dev server sends nothing.** It logs each batch it would send with
  `console.debug` ("Visitors: what a build would send to Infra"), so the
  browser's console shows what's recorded, at the Verbose level. A build
  on this computer (`pnpm preview`) does send, and Infra checks it and
  keeps nothing from `localhost`.
- **A build** sends to `https://infra.superforge.studio/v1/projects/<project_id>/events`,
  which takes events only from the project's domains, listed on the
  dashboard's Infra tab: add the app's Railway address and its own
  domain there.

## What's recorded

| Event   | When                                                        | Properties                                                                                          |
| ------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `view`  | Each page the router resolves, the first one once           | On the first: `referrer`, the other site's hostname, and `utm_source`, `utm_medium`, `utm_campaign` |
| `leave` | Leaving a page: another page, or the page hiding or closing | `scroll`, how far down it was scrolled (0 to 100), and `visible_ms`, how long it was visible        |
| `click` | A link, a button, `role="button"` or anything `data-track`  | `target`, its `data-track` or else its tag; `text`, its label or what it shows; a link's `href`     |
| `error` | An uncaught error or rejected promise, ten a page at most   | `message`, and where: `source`, `line`, `column`                                                    |

Each has its page's path and when it happened. A page whose tab is
hidden and comes back has a `leave` each time it's left, each with the
time it was visible since the last; `scroll` is the deepest so far. A
change to only the query or the fragment isn't a new page.

A batch goes every five seconds while there's something to send, at
most 100 events and 32 KB a call, and as the page hides, what's left goes
with `keepalive`, which outlives the page. A batch Infra couldn't take
(no network, or a 5xx) is tried again, waiting longer each time, up to
five minutes; one it refused (a 4xx) is dropped. A page holds at most 500
waiting, and drops the oldest past them.

## What's never recorded

- **A query string or a fragment**, in a path, a link or an error, which
  can hold a token or an address. A page's path is `location.pathname`.
- **Anything typed**: a field's value is never read, and a click on a
  field keeps no text.
- **Anything shaped like an email address**, in a click's text or an
  error's message: it becomes `[email]`.
- **The text of anything inside `data-private`**, like the dashboard,
  which shows people's names and the business's data
  (`routes/dashboard/route.tsx`). Its clicks still count, by `target` and
  `href`.
- **An email as who's signed in**: `identify()` takes the app's own user
  ID, and refuses anything with an `@`.

## Consent

**`CONSENT` in `consent.ts` is the owner's choice**, which
`START-HERE.md` asks about:

- **`"ask"`**, the default: a small banner in a corner asks each visitor,
  once, whether the site may remember their browser
  (`components/site/consent-banner.tsx`, drawn by the root route on every
  page, the dashboard's too). Until they accept, and after they decline,
  the script keeps nothing on their device and sends only `view`,
  `leave` and `error`, with no visitor, no visit and no user: anonymous
  counts. Their answer is kept, a refusal too, so they aren't asked
  again.
- **`"assume"`**: no banner, and the browser is remembered from the first
  visit, for an owner whose customers no consent rules cover. A visitor
  who declined before the change stays declined.

Once a visitor is remembered, localStorage holds their answer
(`visitors.consent`), a lasting visitor ID (`visitors.visitor`, `v_` and
32 hex digits), the visit's ID with when it last saw something happen
(`visitors.session`: a new one after 30 minutes with nothing), and
whatever a page couldn't send before it hid, while Infra or the network
was down (`visitors.waiting`), which the next page sends. Their events
carry the IDs and who's signed in, and their clicks and the app's own
events are sent. Declining, in this tab or another, forgets all of it
but the answer.

The answer is the visitor's alone to change for now: a link that lets
them change their mind would call `answerConsent()` from `index.ts`.

## Naming a click: `data-track`

Tailwind's classes say nothing about what a button is for, so a click is
named by its `data-track`, on the link or button itself:

```tsx
;<a href="/book" data-track="book-a-call">
    Book a call
</a>
```

Without one, a click is named by its tag (`a`, `button`), with its text.

## The app's own events: `track()`

```ts
import { track } from "@/frontend/visitors"

track("booked-a-call", { plan: "monthly", seats: 3 })
```

A name is lowercase words joined by hyphens, at most 64 characters, and
not one of the four above; properties are flat, at most 32, each a
string of at most 1,000 characters, a number, a boolean or null. One
that doesn't fit is dropped with a warning in the console. They're sent
only of a remembered visitor: what has to count for everyone, like a
sign-up or a payment, the server sends (`backend/infra/`), as
`backend/auth/routes.ts` sends `signed-up`.

## Who's signed in: `identify()`

`identify(user.id)` puts the app's own user ID on a remembered visitor's
events, and `identify(null)` takes it off. The dashboard calls it as it
learns who's signed in (`routes/dashboard/route.tsx`), and signing in
and out do (`queries/auth.ts`), so a page loaded on its own carries no
user until the visitor opens the dashboard or signs in.

## In this folder

- `index.ts`: what the app calls: `startVisitors`, `track`, `identify`,
  and the banner's `askingConsent`, `answerConsent` and
  `onConsentAnswer`.
- `consent.ts`: `CONSENT`, and what each answer allows.
- `record.ts`: the recorder, which turns what the browser says into
  events and sends them, with the device, the clock and the sender
  handed to it, so its tests run in Node.
- `browser.ts`: the recorder wired to the page and the router, and the
  call to Infra.
- `describe.ts`: what an event says about a landing, a click or an
  error, scrubbed.
- `queue.ts`: an event's shape, the batches and what waits on the
  device.
- `session.ts`: the visitor's ID and the visit's.
- `device.ts`: localStorage, read with zod.
- `project.ts`: the project ID, from `.superforge/superforge.json`.
- `tests/`: the recorder, the batches, the IDs and the scrubbing, in
  Node.
