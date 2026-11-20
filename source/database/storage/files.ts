import type { ObjectStore } from "."
import type { Files } from "./kind"

/**
 * Every kind of file the app keeps, each a folder in the `Storage` bucket,
 * as `context.var.storage` in a route:
 * `context.var.storage.invoices.put(key, body)`, `.get(key)` and
 * `.delete(key)`. Nothing reaches the bucket any other way,
 * so every file is filed under a key its kind checks, at the path its kind
 * makes, holding what its kind says (./kind.ts).
 *
 * There are no kinds yet. A kind is a getter here, named for its folder,
 * and listed in `kinds`, and the first one starts like this:
 *
 *   import { z } from "zod"
 *   import { bytes, Files } from "./kind"
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
        return []
    }
}
