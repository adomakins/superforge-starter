import { z } from "zod"
import { page_path } from "./events"

// What the toolbar (frontend/components/toolbar/) posts to the app's own
// /api/comments (backend/comments/), which checks it with the same schemas
// before it sends it on to Superforge Infra with who filed it, as Infra
// checks it (backend/infra/README.md, "Comments").

/** The most a comment says, in characters, as Infra takes it. */
export const LONGEST_COMMENT = 5000

/** How big one comment's body can be, in bytes, as Infra takes it. */
export const COMMENT_BODY_LIMIT = 32 * 1024

/** What someone wrote: something, and at most `LONGEST_COMMENT` characters. */
export const comment_body = z
    .string()
    .trim()
    .min(1, "Write what should change first")
    .max(LONGEST_COMMENT, "That's more than a comment can say")

// A place or a length on the page, in whole CSS pixels: a page can be
// scrolled far, and an element can sit above its top
const coordinate = z.number().int().min(-1_000_000).max(10_000_000)
const length = z.number().int().min(0).max(10_000_000)

/**
 * The element a comment is about, as the toolbar describes it
 * (components/toolbar/describe.ts): a CSS selector from the page's body,
 * which finds it again; its tag; the text it shows or its label, null when
 * it may show something private; its `class`, which an agent can search
 * the code for; and its box on the page, from the top of the document.
 */
export const commented_element = z.object({
    selector: z.string().trim().min(1).max(1000),
    tag: z
        .string()
        .max(64)
        .regex(/^[a-z][a-z0-9-]*$/),
    text: z.string().max(1000).nullable(),
    classes: z.string().max(1000).nullable(),
    box: z.object({
        x: coordinate,
        y: coordinate,
        width: length,
        height: length
    })
})
export type CommentedElement = z.infer<typeof commented_element>

/**
 * A comment as the toolbar posts it: what was written, the page it's on,
 * the element, or null for the page as a whole, and the window's size.
 * Nothing of who wrote it, which the server adds from their session.
 */
export const page_comment = z.object({
    body: comment_body,
    path: page_path,
    title: z.string().trim().max(200).nullable(),
    element: commented_element.nullable(),
    viewport: z.object({ width: length, height: length }).nullable()
})
export type PageComment = z.infer<typeof page_comment>
