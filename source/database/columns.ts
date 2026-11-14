import { sql } from "drizzle-orm"
import { timestamp as postgresTimestamp, text, uuid } from "drizzle-orm/pg-core"

// Column types the schema (schema.ts) shares. drizzle-kit reads it, so this
// imports nothing through the app's `@/` paths.

/** A uuid, made by Postgres. */
export function id() {
    return uuid().primaryKey().defaultRandom()
}

/**
 * A moment, read back as a Date. Kept to the millisecond, as a Date holds
 * it, so a row read back and saved again compares equal to what's stored.
 */
export function timestamp() {
    return postgresTimestamp({ withTimezone: true, precision: 3 })
}

/** A list of strings, empty rather than null. */
export function textList() {
    return text().array().notNull().default(sql`'{}'::text[]`)
}
