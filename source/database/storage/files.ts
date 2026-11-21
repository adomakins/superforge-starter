import { z } from "zod"
import type { ObjectStore } from "."
import { Files, json } from "./kind"

/** Today's salt, as the bucket keeps it (`Storage.visitor_salt`). */
export const visitor_salt = z.object({
    // The UTC day it's for, like `2026-11-21`
    day: z.iso.date(),
    salt: z.string().min(1)
})
export type VisitorSalt = z.infer<typeof visitor_salt>

/**
 * Every kind of file the app keeps, each a folder in the `Storage` bucket,
 * as `context.var.storage` in a route:
 * `context.var.storage.invoices.put(key, body)`, `.get(key)` and
 * `.delete(key)`. Nothing reaches the bucket any other way,
 * so every file is filed under a key its kind checks, at the path its kind
 * makes, holding what its kind says (./kind.ts).
 *
 * A kind is a getter here, named for its folder, and listed in `kinds`.
 * The template's one, `visitor_salt`, is a single file of the server's
 * own; a kind of the business's, with a file for each of something,
 * starts like this:
 *
 *   import { bytes } from "./kind"
 *
 *   get invoices() {
 *       return new Files(this.store, {
 *           folder: "invoices",
 *           shown: {
 *               name: "Invoices",
 *               about: "Each invoice sent, as the customer got it.",
 *               access: "locked",
 *               why: "Each is what a customer was sent, so it stays as it went out."
 *           },
 *           key: z.object({ customer_id: z.uuid(), invoice_id: z.uuid() }),
 *           path: ({ customer_id, invoice_id }) =>
 *               `${customer_id}/${invoice_id}.pdf`,
 *           content: bytes("application/pdf")
 *       })
 *   }
 *
 * `shown` is how the kind shows on a screen of the bucket's folders: its
 * name, what it holds, and, for files the code writes and depends on,
 * `locked` with why, so people may look and download but never change them
 * there. `json(schema)` keeps a JSON document checked with zod both ways,
 * and `text(content_type)` keeps text. The key's first part is what the
 * file hangs off, so everything of one customer's is one prefix, and a row
 * in Postgres keeps the key's parts, not the path.
 */
export class Storage {
    // Protected, so a test can add kinds of its own in a subclass
    constructor(protected readonly store: ObjectStore) {}

    /**
     * Every kind, each getter here once, in the order a screen of the
     * bucket's folders lists them, like `[this.invoices]`. A getter left out
     * fails its test (./tests/kinds.test.ts), and a folder in the bucket
     * that no kind here claims is one nothing in the code writes.
     */
    get kinds(): Files<unknown, unknown>[] {
        return [this.visitor_salt]
    }

    /**
     * Today's salt, which a visitor the site doesn't remember is hashed
     * with, so they count as one visitor that day
     * (backend/visits/visitors.ts): one file, replaced by the next day's,
     * so no hash can be made again once its day is over. It's here rather
     * than in Postgres, whose point-in-time recovery would keep a deleted
     * row for weeks.
     */
    get visitor_salt() {
        return new Files(this.store, {
            folder: "visitor-salt",
            shown: {
                name: "Visitor salt",
                about: "Today's salt, which counts visitors the site doesn't remember, a day at a time.",
                access: "locked",
                why: "The server replaces it each day, and changing it would count today's visitors again."
            },
            // One file, so its key says nothing
            key: z.object({}),
            path: () => "today.json",
            content: json(visitor_salt)
        })
    }
}
