import { randomUUID } from "node:crypto"
import { getTableColumns, getTableName, is } from "drizzle-orm"
import { getTableConfig, PgTable } from "drizzle-orm/pg-core"
import type pg from "pg"
import * as schema from "../../schema"

// Sample rows in every table of a database, whatever version of the schema
// it's at, read from Postgres's catalog rather than from schema.ts: the
// upgrade test fills a database at the base branch's version, then applies
// the PR's migrations over it (upgrade.test.ts). The rows are shaped to trip
// a migration that existing rows break:
// - every nullable column is null in the first row, so a new NOT NULL fails
// - a column outside every key holds the same value in each other row, so a
//   new unique index on it fails
// - keys, and columns in a unique constraint, differ from row to row
// - a foreign key names a row of the table it points at, every column of a
//   key over several (`(account_id, contact_id)`) from the same row
// Where schema.ts lists a text column's values (`text({ enum })`), the rows
// use them, so a check constraint matching them passes.

const ROWS = 3

// The Postgres schemas whose tables get rows: the app's data, and the
// machinery's own state, once it has some (schema.ts)
const SCHEMAS = ["public", "internal"]

type Column = {
    name: string
    type: string
    nullable: boolean
    defaulted: boolean
    // Part of the primary key or a unique constraint
    unique: boolean
    references: {
        table: string
        column: string
        // Whether a column of its foreign key is in a key, so a row's
        // parent is the parent's row of the same number, the same for every
        // column of the key
        keyed: boolean
    } | null
}

/**
 * Fills every table in `SCHEMAS`, and says how many rows each got, by its
 * name: bare in `public`, and after its schema in another, like
 * `internal.pit_uses` (`tableName()`).
 */
export async function fill(client: pg.ClientBase) {
    const tables = await tablesInOrder(client)
    const counts: Record<string, number> = {}
    const written = new Map<string, Record<string, unknown>[]>()

    for (const [table, columns] of tables) {
        const rows: Record<string, unknown>[] = []
        for (let row = 0; row < ROWS; row++) {
            const values = new Map<string, unknown>()
            for (const column of columns) {
                const value = valueFor(table, column, row, written)
                if (value !== undefined) {
                    values.set(column.name, value)
                }
            }
            const names = [...values.keys()]
            const into = table
                .split(".")
                .map((part) => `"${part}"`)
                .join(".")
            const query =
                names.length === 0
                    ? `insert into ${into} default values returning *`
                    : `insert into ${into} (${names.map((name) => `"${name}"`).join(", ")}) values (${names.map((_, at) => `$${at + 1}`).join(", ")}) returning *`
            const result = await client.query(query, [...values.values()])
            rows.push(...result.rows)
        }
        written.set(table, rows)
        counts[table] = rows.length
    }
    return counts
}

// A column's value in a row, or undefined to leave it to its default
function valueFor(
    table: string,
    column: Column,
    row: number,
    written: Map<string, Record<string, unknown>[]>
) {
    if (column.nullable && row === 0 && !column.unique) {
        return null
    } else if (column.references !== null) {
        // A distinct parent for each row, when the column, or its foreign
        // key, is in a key
        const parents = written.get(column.references.table) ?? []
        const parent =
            parents[column.unique || column.references.keyed ? row : 0]
        return parent?.[column.references.column] ?? null
    } else if (column.defaulted && column.unique) {
        // A generated key, like a uuid
        return undefined
    } else {
        return sample(table, column, column.unique ? row : 1)
    }
}

// A value of the column's type: the `variant`th of its kind
function sample(table: string, column: Column, variant: number) {
    const listed = enumValues(table, column.name)
    if (listed !== undefined) {
        return listed[variant % listed.length]
    }
    switch (column.type) {
        case "uuid":
            return randomUUID()
        case "text":
            return `sample-${variant}`
        case "_text":
            return [`sample-${variant}`]
        case "int2":
        case "int4":
        case "int8":
        case "numeric":
        case "float4":
        case "float8":
            return variant
        case "bool":
            return variant % 2 === 1
        case "timestamptz":
        case "timestamp":
        case "date":
            return new Date(Date.UTC(2026, 0, 1 + variant))
        case "jsonb":
        case "json":
            return JSON.stringify({ sample: variant })
        default:
            throw new Error(
                `fill() has no sample for ${table}.${column.name}, of type ${column.type}`
            )
    }
}

/** A table's name as `fill()` counts it: bare in `public`, else qualified. */
export function tableName(table: PgTable) {
    const { schema: in_schema = "public" } = getTableConfig(table)
    const name = getTableName(table)
    return in_schema === "public" ? name : `${in_schema}.${name}`
}

// The values schema.ts lists for a text column, if it lists any
function enumValues(table: string, column: string) {
    for (const value of Object.values(schema)) {
        if (is(value, PgTable) && tableName(value) === table) {
            const found = Object.values(getTableColumns(value)).find(
                (each) => each.name === column
            )
            if (found !== undefined && found.enumValues !== undefined) {
                return found.enumValues.length > 0
                    ? found.enumValues
                    : undefined
            }
        }
    }
    return undefined
}

// A table's name as `tableName()` gives it, in the catalog's SQL: from the
// aliases of its row in pg_namespace and in pg_class
function qualifiedName(namespace: string, table: string) {
    return `case when ${namespace}.nspname = 'public' then ${table}.relname else ${namespace}.nspname || '.' || ${table}.relname end`
}

// The column a foreign key points at, from the catalog's row for it
function referenceOf(
    key:
        | {
              references_table: string | null
              references_column: string | null
          }
        | undefined,
    keyed: boolean
) {
    if (
        key === undefined ||
        key.references_table === null ||
        key.references_column === null
    ) {
        return null
    } else {
        return {
            table: key.references_table,
            column: key.references_column,
            keyed
        }
    }
}

// Every table in `SCHEMAS`, with its columns, each after the tables its
// foreign keys point at. A table is named as `tableName()` names it.
async function tablesInOrder(client: pg.ClientBase) {
    const { rows: columns } = await client.query<{
        table_name: string
        column_name: string
        type: string
        nullable: boolean
        defaulted: boolean
    }>(
        `
        select ${qualifiedName("n", "c")} as table_name, a.attname as column_name,
            t.typname as type, not a.attnotnull as nullable,
            (a.atthasdef or a.attidentity <> '' or a.attgenerated <> '') as defaulted
        from pg_attribute a
        join pg_class c on c.oid = a.attrelid
        join pg_namespace n on n.oid = c.relnamespace
        join pg_type t on t.oid = a.atttypid
        where n.nspname = any($1) and c.relkind in ('r', 'p')
            and a.attnum > 0 and not a.attisdropped
        order by n.nspname, c.relname, a.attnum
    `,
        [SCHEMAS]
    )
    const { rows: keys } = await client.query<{
        table_name: string
        column_name: string
        kind: string
        constraint_name: string | null
        references_table: string | null
        references_column: string | null
    }>(
        `
        select ${qualifiedName("n", "c")} as table_name, a.attname as column_name,
            k.contype as kind, k.conname as constraint_name,
            ${qualifiedName("fn", "f")} as references_table,
            fa.attname as references_column
        from pg_constraint k
        join pg_class c on c.oid = k.conrelid
        join pg_namespace n on n.oid = c.relnamespace
        cross join lateral unnest(k.conkey) with ordinality as own(attnum, position)
        join pg_attribute a on a.attrelid = c.oid and a.attnum = own.attnum
        left join pg_class f on f.oid = k.confrelid
        left join pg_namespace fn on fn.oid = f.relnamespace
        left join pg_attribute fa on fa.attrelid = k.confrelid
            and fa.attnum = k.confkey[own.position]
        where n.nspname = any($1) and k.contype in ('p', 'u', 'f')
        union
        select ${qualifiedName("n", "c")}, a.attname, 'u', null, null, null
        from pg_index i
        join pg_class c on c.oid = i.indrelid
        join pg_namespace n on n.oid = c.relnamespace
        join pg_attribute a on a.attrelid = c.oid and a.attnum = any(i.indkey)
        where n.nspname = any($1) and i.indisunique
    `,
        [SCHEMAS]
    )

    // Whether a column is in its table's primary key or a unique constraint
    const unique = (table: string, column: string) =>
        keys.some(
            (key) =>
                key.table_name === table &&
                key.column_name === column &&
                (key.kind === "p" || key.kind === "u")
        )

    const tables = new Map<string, Column[]>()
    for (const row of columns) {
        const own = keys.filter(
            (key) =>
                key.table_name === row.table_name &&
                key.column_name === row.column_name
        )
        const reference = own.find((key) => key.kind === "f")
        const keyed =
            reference !== undefined &&
            keys.some(
                (key) =>
                    key.table_name === row.table_name &&
                    key.constraint_name === reference.constraint_name &&
                    unique(row.table_name, key.column_name)
            )
        const list = tables.get(row.table_name) ?? []
        list.push({
            name: row.column_name,
            type: row.type,
            nullable: row.nullable,
            defaulted: row.defaulted,
            unique: own.some((key) => key.kind === "p" || key.kind === "u"),
            references: referenceOf(reference, keyed)
        })
        tables.set(row.table_name, list)
    }

    // Parents first. A table that points at itself is filled as it goes.
    const ordered: [string, Column[]][] = []
    const placed = new Set<string>()
    while (placed.size < tables.size) {
        const ready = [...tables].filter(
            ([table, list]) =>
                !placed.has(table) &&
                list.every(
                    (column) =>
                        column.references === null ||
                        column.references.table === table ||
                        placed.has(column.references.table)
                )
        )
        if (ready.length === 0) {
            throw new Error("fill() can't order tables whose keys form a cycle")
        }
        for (const entry of ready) {
            ordered.push(entry)
            placed.add(entry[0])
        }
    }
    return ordered
}
