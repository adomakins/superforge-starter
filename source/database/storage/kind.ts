import { z } from "zod"
import type { ObjectStore } from "."

// One kind of file the app keeps (files.ts): the folder its files go in, the
// key one is filed under, checked with zod before any path is made from it,
// where in the folder a key's file goes, and what's in it. So a route never
// writes a path by hand, and a missing id or a stray slash fails loudly
// rather than landing a file where no read will find it.

/** What a kind's files hold, and how it goes to and from the bucket's bytes. */
export type Format<Body> = {
    content_type: string
    encode(body: Body): string | Uint8Array<ArrayBuffer>
    decode(bytes: Uint8Array<ArrayBuffer>, path: string): Body
}

export type Kind<Key, Body> = {
    /** The kind's folder at the top of the bucket, like `invoices`. */
    folder: string
    /** What a file is filed under, like `{ customer_id, invoice_id }`. */
    key: z.ZodType<Key>
    /** Where a key's file goes in the folder, like `<customer id>/<invoice id>.pdf`. */
    path(key: Key): string
    content: Format<Body>
}

/** The files of one kind: each filed under its key, in the kind's folder. */
export class Files<Key, Body> {
    constructor(
        private readonly store: ObjectStore,
        private readonly kind: Kind<Key, Body>
    ) {}

    /**
     * Where `key`'s file is in the bucket: the kind's folder, then its path.
     * Throws on a key that doesn't fit the kind, or a path with an empty,
     * `.` or `..` part.
     */
    path(key: Key): string {
        const path = `${this.kind.folder}/${this.kind.path(this.kind.key.parse(key))}`
        const parts = path.split("/")
        if (
            parts.some((part) => part === "" || part === "." || part === "..")
        ) {
            throw new Error(`A ${this.kind.folder} key made the path ${path}`)
        } else {
            return path
        }
    }

    /** Keeps `body` as `key`'s file, in place of any before it, and says where. */
    async put(key: Key, body: Body): Promise<string> {
        const path = this.path(key)
        await this.store.put(
            path,
            this.kind.content.encode(body),
            this.kind.content.content_type
        )
        return path
    }

    /** `key`'s file, or null when there isn't one. */
    async get(key: Key): Promise<Body | null> {
        const path = this.path(key)
        const bytes = await this.store.get(path)
        if (bytes === null) {
            return null
        } else {
            return this.kind.content.decode(bytes, path)
        }
    }

    /** Deletes `key`'s file, if there is one. */
    async delete(key: Key): Promise<void> {
        await this.store.delete(this.path(key))
    }
}

/**
 * A JSON document, checked against `schema` as it's kept and as it's read
 * back. So a schema only grows the way a column does: a new field is
 * optional, or files kept before it fail to read.
 */
export function json<Body>(schema: z.ZodType<Body>): Format<Body> {
    return {
        content_type: "application/json",
        encode(body) {
            return JSON.stringify(schema.parse(body))
        },
        decode(bytes, path) {
            const read = schema.safeParse(
                JSON.parse(new TextDecoder().decode(bytes))
            )
            if (read.success) {
                return read.data
            } else {
                throw new Error(
                    `${path} doesn't hold what its kind says: ${z.prettifyError(read.error)}`
                )
            }
        }
    }
}

/** Text, like an email's HTML, of one content type (`text/html; charset=utf-8`). */
export function text(content_type: string): Format<string> {
    return {
        content_type,
        encode(body) {
            return body
        },
        decode(bytes) {
            return new TextDecoder().decode(bytes)
        }
    }
}

/** Bytes as they came, like a PDF or an image, of one content type. */
export function bytes(content_type: string): Format<Uint8Array<ArrayBuffer>> {
    return {
        content_type,
        encode(body) {
            return body
        },
        decode(body) {
            return body
        }
    }
}
