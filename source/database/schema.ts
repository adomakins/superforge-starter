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
// - The app's data is in `public`. What no person ever sees (sessions,
//   codes, the machinery's own state) goes in an `internal` schema, made
//   with `pgSchema("internal")` the first time a table needs it.
export {}
