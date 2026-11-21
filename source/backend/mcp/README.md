# The app's MCP

An MCP server at the app's own `/mcp`, so Claude, on a laptop, in a cloud
session or in claude.ai, can read the app's data and work in it as one of
the business's own people. It's MCP's Streamable HTTP without sessions:
each request gets a server of its own and a plain JSON answer, so a
deploy loses nothing.

## How Claude connects

**Nobody sets anything up, or pastes a token.** Add the app's
`https://<its domain>/mcp` to Claude once: as a connector on claude.ai
(Settings, Connectors), which reaches claude.ai, the desktop app, cloud
sessions and scheduled tasks, or in Claude Code. Then:

1. Claude calls `/mcp` and is told to sign in: a 401 with
   `WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource/mcp"`.
2. Claude reads where to sign in, the app itself
   (`backend/agents/oauth.ts`), and opens the browser at the app's
   `/oauth/authorize`, which Superforge Infra answers through the app.
3. The browser lands on the app's own Allow page, `/connect/<id>`. Someone
   on the team signs in there if they aren't already, and allows Claude
   to read, or to read and act.
4. Claude gets a token Infra signed, and refreshes it on its own, so they
   sign in once. Their account page lists the connection, and Disconnect
   ends it within ten minutes.

A dev server connects the same way with an Infra test key
(`INFRA_TEST_KEY`), at `http://localhost:3000/mcp`. Without one, the
stand-in can't sign Claude in.

## How it works

- **It's a client of the API, not of the database.** Each tool calls the
  routes under `/api` in this process, with the token Claude brought,
  which `signedIn` takes in a cookie's place (`backend/auth/agents.ts`).
  So Claude can do what its person can through the API, with the same
  checks, and the MCP holds no logic of its own
  (`workbench/writing-code.md`, "Headless").
- **What the person allowed is enforced on every call.** `read` makes
  `GET` requests only (403 `read-only` otherwise), and `act` everything
  else. No token, whatever it allows, changes who can sign in or ends
  anyone's session: those routes take `inBrowser` (403 `browser-only`).
- **Only the business's own people can connect**, and a token stops
  working the moment its person is taken off the team in
  `backend/auth/access.ts`, since every request checks.

## The tools

| Tool          | What it does                                                                            |
| ------------- | --------------------------------------------------------------------------------------- |
| `list_routes` | Every route under `/api`: its method and path                                           |
| `call_api`    | Calls one, as the person, with a query and a JSON body, and answers its status and JSON |

So every route a feature adds is a tool already. A feature that wants a
tool of its own, with a name and a description Claude reads first, adds
it in `index.ts`'s `registerTools`, calling its route the same way.
