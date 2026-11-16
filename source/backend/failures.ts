import { zValidator } from "@hono/zod-validator"
import type { Context, ErrorHandler, NotFoundHandler } from "hono"
import type { ContentfulStatusCode } from "hono/utils/http-status"
import type { z } from "zod"

// How every route fails, in the one shape the site, scripts and agents all
// read (utilities/schemas/failures.ts): `{ error: { reason, message } }`,
// with the status that says what kind of failure it is.

/**
 * Answers `status` with a failure: `reason` for a program to branch on,
 * `message` for a person, and any `details` a caller can act on, like a
 * 429's `retry_after` (utilities/schemas/failures.ts has the ones a page
 * reads). The typed client knows the reason and the details, so a page can
 * tell one failure from another.
 */
export function failure<
    Reason extends string,
    Status extends ContentfulStatusCode,
    Details extends Record<string, string | number | boolean> = Record<
        never,
        never
    >
>(
    context: Context,
    status: Status,
    reason: Reason,
    message: string,
    details?: Details
) {
    return context.json({ error: { ...details, reason, message } }, status)
}

/**
 * A route's input checked with zod, `target` being what's checked: the
 * `json` body, the `param`s in its path, the `query`. The handler reads it
 * with `context.req.valid(target)`, and the typed client knows its shape.
 * Input that doesn't fit is answered 400 with `invalid`, and what didn't
 * fit, field by field, so a form can say which. Every route checks its
 * input this way, with a schema from utilities/schemas/ when a form checks
 * the same.
 */
export function validated<
    Target extends "json" | "param" | "query" | "form" | "header" | "cookie",
    Schema extends z.ZodType
>(target: Target, schema: Schema) {
    return zValidator(target, schema, (result, context) => {
        if (!result.success) {
            return context.json(
                {
                    error: {
                        reason: "invalid" as const,
                        message:
                            "The request doesn't fit what this route takes",
                        issues: result.error.issues.map((issue) => ({
                            path: issue.path.join("."),
                            message: issue.message
                        }))
                    }
                },
                400
            )
        }
    })
}

/** A path under /api that no route answers. */
export const answerNotFound: NotFoundHandler = (context) =>
    failure(context, 404, "not-found", "No route answers this path")

/**
 * A route that threw: a bug, or something it was never meant to handle,
 * since an expected failure is answered, not thrown. It's logged, and the
 * caller learns only that it failed.
 */
export const answerUnexpected: ErrorHandler = (error, context) => {
    console.error("A route threw", {
        method: context.req.method,
        path: context.req.path,
        error
    })
    return failure(context, 500, "unexpected", "Something went wrong")
}
