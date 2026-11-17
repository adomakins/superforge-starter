// Drizzle table definitions (Postgres). This file is the source of truth for
// the schema: change it, run `pnpm database:generate`, and commit the
// migration with it (workbench/writing-code.md, "Data"). A table of the
// business's own starts like `users`, below:
//
//   export const customers = pgTable("customers", {
//       id: id(),
//       name: text().notNull(),
//       created_at: timestamp().notNull().defaultNow()
//   })
//
// The conventions:
// - A table is named for what it hangs off (`customer_*` for what belongs
//   to a customer), in the plural, with snake_case columns, which Drizzle
//   keeps as written.
// - Our own rows are keyed by a uuid (`id()` in columns.ts), or by what
//   makes them unique when that's natural.
// - Every timestamp is a `timestamptz` to the millisecond (`timestamp()`),
//   compared against `now` and `fromNow` from time.ts.
// - Every table gets sample rows in seed/seed.ts in the same change, or a
//   line in its UNSEEDED saying why not, which seed/tests/ checks.
// - A table goes in one of four Postgres schemas, by who owns its rows and
//   who sees them, never one per feature (features are folders in code):
//   - `public`: the business's own data, whatever the app is built to do,
//     its users among it: they're its customers and staff, whom its other
//     tables point at. A table here is `pgTable(...)`.
//   - `auth`: what lets someone in: their sessions, and API tokens later.
//     The most sensitive rows, since one is as good as a password, kept
//     apart so a read-only role can leave them out. A table here is
//     `auth.table(...)`. The sign-in codes aren't here: Infra keeps them.
//   - `internal`: the rest of the machinery, what no person sees, like an
//     error log or rate limits. A table here is `internal.table(...)`.
//   - `dbos`: DBOS's own tables, the workflows' runs and their steps
//     (backend/workflows/), which it makes and migrates itself. Nothing
//     here writes to it, and it isn't declared below.
import { sql } from "drizzle-orm"
import {
    check,
    index,
    pgSchema,
    pgTable,
    text,
    uuid
} from "drizzle-orm/pg-core"
// Relative, since drizzle-kit reads this file without the app's `@/` paths
import { ROLES } from "../utilities/schemas/users"
import { id, timestamp } from "./columns"

export const auth = pgSchema("auth")
export const internal = pgSchema("internal")

// The business's own people and everyone it serves, everyone who can sign
// in: signing in for the first time makes the row (backend/auth/sign-in.ts),
// unless an internal person added them first (backend/users/). Infra proves
// the address is theirs, and keeps nothing of them.
export const users = pgTable(
    "users",
    {
        id: id(),
        // Trimmed and lowercased as it comes in, so the unique constraint
        // catches case variants
        email: text().notNull().unique(),
        // What they'd like to be called, which they set on their account
        name: text(),
        // Who they are to the business, which decides what of the dashboard
        // they see (utilities/schemas/users.ts has the roles): text with a
        // check rather than a Postgres enum, since a role added to an enum
        // can't be used in the transaction that adds it, and a deploy
        // applies every pending migration in one
        role: text({ enum: ROLES }).notNull().default("external"),
        // When they last signed in, or null for someone who never has, like
        // a user added by hand before they do
        signed_in_at: timestamp(),
        created_at: timestamp().notNull().defaultNow()
    },
    (table) => [
        check(
            "users_role_check",
            sql.raw(
                `"${table.role.name}" in (${ROLES.map((role) => `'${role}'`).join(", ")})`
            )
        )
    ]
)

// A browser's sign-in, which its `session` cookie holds the token for
// (backend/auth/sessions.ts). Only the token's SHA-256 is kept. It lasts 30
// days from when it was last renewed, and signing out deletes it.
export const sessions = auth.table(
    "sessions",
    {
        token_hash: text().primaryKey(),
        user_id: uuid()
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        // The browser it's in, as it said (its User-Agent), so the account
        // page can say where someone is signed in
        user_agent: text(),
        expires_at: timestamp().notNull(),
        created_at: timestamp().notNull().defaultNow()
    },
    (table) => [index("sessions_user_id_index").on(table.user_id)]
)
