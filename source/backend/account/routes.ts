import { Hono } from "hono"
import { z } from "zod"
import { account_change } from "@/utilities/schemas/users"
import { listedInternal } from "../auth/access"
import {
    endOtherSessions,
    endSessionById,
    listSessions
} from "../auth/sessions"
import { signedIn } from "../auth/signed-in"
import type { ApiEnvironment } from "../context"
import { failure, validated } from "../failures"
import { renameUser } from "./rename"

// A session's id in a path: the start of its token's hash
// (auth/sessions.ts's `sessionId`)
const session_path = z.object({ id: z.string().regex(/^[0-9a-f]{16}$/) })

/**
 * The signed-in person's own account, under /api/account, whatever their
 * role: what they're called, and the browsers they're signed in on, with
 * signing out of the others. Their address is who they are, so it doesn't
 * change here, and neither does the name of one of the business's own,
 * which is the one they're listed with in code (auth/access.ts).
 */
export const accountRoutes = new Hono<ApiEnvironment>()
    .patch(
        "/account",
        signedIn,
        validated("json", account_change),
        async (context) => {
            if (listedInternal(context.var.access, context.var.user.email)) {
                return failure(
                    context,
                    409,
                    "listed",
                    "Your name is the one you're listed with in the app's code, so it changes there"
                )
            }
            const renamed = await renameUser(
                context.var.database,
                context.var.user.id,
                context.req.valid("json").name
            )
            return context.json({ name: renamed?.name ?? null }, 200)
        }
    )

    // Where they're signed in, this browser's session marked as current
    .get("/account/sessions", signedIn, async (context) => {
        const sessions = await listSessions(
            context.var.database,
            context.var.user.id
        )
        return context.json(
            {
                sessions: sessions.map((session) => ({
                    ...session,
                    current: session.id === context.var.session.id
                }))
            },
            200
        )
    })

    // Signs one of their other browsers out. This one signs out through
    // /api/auth/sign-out, which clears its cookie too.
    .delete(
        "/account/sessions/:id",
        signedIn,
        validated("param", session_path),
        async (context) => {
            const { id } = context.req.valid("param")
            if (id === context.var.session.id) {
                return failure(
                    context,
                    409,
                    "current",
                    "That's this browser: sign out instead"
                )
            }
            const ended = await endSessionById(
                context.var.database,
                context.var.user.id,
                id
            )
            if (ended.ok) {
                return context.json({ ended: true as const }, 200)
            } else {
                return failure(context, 404, ended.error, "No such session")
            }
        }
    )

    // Signs every other browser out, keeping this one
    .post("/account/sessions/sign-out-others", signedIn, async (context) => {
        const ended = await endOtherSessions(
            context.var.database,
            context.var.user.id,
            context.var.session.id
        )
        console.info("Signed out everywhere else", {
            user_id: context.var.user.id,
            ended
        })
        return context.json({ ended }, 200)
    })
