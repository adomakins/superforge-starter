// Drizzle table definitions (Postgres). This file is the source of truth for
// the schema: change it, run `pnpm database:generate`, and commit the
// migration with it (workbench/writing-code.md, "Data"). There are no tables
// yet; the first one starts like this:
//
//   import { pgTable, text } from "drizzle-orm/pg-core"
//   import { id, timestamp } from "./columns"
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
// - A table goes in one of four Postgres schemas, by who owns its rows and
//   who sees them, never one per feature (features are folders in code):
//   - `public`: the business's own data, whatever the app is built to do.
//     A table here is `pgTable(...)`.
//   - `auth`: who can get in: users, sessions, sign-in codes and API
//     tokens. The most sensitive rows, kept apart so a read-only role can
//     leave them out. A table here is `auth.table(...)`.
//   - `internal`: the rest of the machinery, what no person sees, like an
//     error log or rate limits. A table here is `internal.table(...)`.
//   - `dbos`: DBOS's own tables, which it makes and migrates itself once
//     background workflows arrive. Nothing here writes to it, and it isn't
//     declared below.
import { pgSchema } from "drizzle-orm/pg-core"

export const auth = pgSchema("auth")
export const internal = pgSchema("internal")
