import type { ObjectStore } from "."

/**
 * Every kind of file the app keeps, each a folder in the `Storage` bucket,
 * as `c.var.storage` in a route: `c.var.storage.invoices.put(key, body)`,
 * `.get(key)` and `.delete(key)`. Nothing reaches the bucket any other way,
 * so every file is filed under a key its kind checks, at the path its kind
 * makes, holding what its kind says (./kind.ts).
 *
 * There are no kinds yet. A kind is a getter here, named for its folder,
 * and the first one starts like this:
 *
 *   import { z } from "zod"
 *   import { bytes, Files } from "./kind"
 *
 *   get invoices() {
 *       return new Files(this.store, {
 *           folder: "invoices",
 *           key: z.object({ customer_id: z.uuid(), invoice_id: z.uuid() }),
 *           path: ({ customer_id, invoice_id }) =>
 *               `${customer_id}/${invoice_id}.pdf`,
 *           content: bytes("application/pdf")
 *       })
 *   }
 *
 * `json(schema)` keeps a JSON document checked with zod both ways, and
 * `text(content_type)` keeps text. The key's first part is what the file
 * hangs off, so everything of one customer's is one prefix, and a row in
 * Postgres keeps the key's parts, not the path.
 */
export class Storage {
    // Protected, so a test can add kinds of its own in a subclass
    constructor(protected readonly store: ObjectStore) {}
}
