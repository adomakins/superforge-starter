import { z } from "zod"

/**
 * What a function that can fail in an expected, recoverable way answers,
 * as a zod schema: `{ ok: true, data }` once it worked, and
 * `{ ok: false, error }` naming the failure when it didn't. `throw` stays
 * reserved for the genuinely unexpected (bugs, unreachable states,
 * infrastructure), so a caller holding one of these knows the failure is
 * one it's meant to handle.
 *
 * Each function's result gets a schema of its own, and its type comes from
 * that (workbench/writing-code.md, "Tagged results for expected failures"):
 *
 *   export const found_post = operationResult(post, z.enum(["not-found"]))
 *   export type FoundPost = z.infer<typeof found_post>
 *
 * The error is required: naming the failure is the point, as an enum of
 * reasons when the reason is the whole story, or an object when it carries
 * context. So the reasons a function can answer are values too, for a test
 * to go through or a page to put words to, and a result that's stored or
 * sent, like a workflow step's, can be checked as it's read back.
 */
export function operationResult<Data extends z.ZodType, Err extends z.ZodType>(
    data: Data,
    error: Err
) {
    return z.discriminatedUnion("ok", [
        z.object({ ok: z.literal(true), data }),
        z.object({ ok: z.literal(false), error })
    ])
}
