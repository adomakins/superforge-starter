import { Hono } from "hono"
import { z } from "zod"
import { user_addition, user_change } from "@/utilities/schemas/users"
import { internalOnly } from "../auth/signed-in"
import type { ApiEnvironment } from "../context"
import { failure, validated } from "../failures"
import { addUser } from "./add"
import { changeRole } from "./change"
import { listUsers } from "./list"
import { removeUser } from "./remove"

// Someone's id in a path
const user_path = z.object({ id: z.uuid() })

/**
 * Everyone who can sign in, under /api/users, for the dashboard's People
 * screen: only the business's own people may (`internalOnly`), and no one
 * changes or removes themselves, so there's always someone who can.
 */
export const userRoutes = new Hono<ApiEnvironment>()
    .get("/users", internalOnly, async (context) => {
        const users = await listUsers(context.var.database)
        return context.json({ users }, 200)
    })

    // Someone added before they sign in, with their role
    .post(
        "/users",
        internalOnly,
        validated("json", user_addition),
        async (context) => {
            const added = await addUser(
                context.var.database,
                context.req.valid("json")
            )
            if (added.ok) {
                console.info("Someone was added", {
                    id: added.data.id,
                    by: context.var.user.id
                })
                return context.json(added.data, 201)
            } else {
                return failure(
                    context,
                    409,
                    added.error,
                    "Someone with this address is already here"
                )
            }
        }
    )

    .patch(
        "/users/:id",
        internalOnly,
        validated("param", user_path),
        validated("json", user_change),
        async (context) => {
            const { id } = context.req.valid("param")
            const changed = await changeRole(context.var.database, {
                id,
                role: context.req.valid("json").role,
                by: context.var.user.id
            })
            if (changed.ok) {
                return context.json({ changed: true as const }, 200)
            } else if (changed.error === "yourself") {
                return failure(
                    context,
                    409,
                    changed.error,
                    "Someone else changes your role"
                )
            } else {
                return failure(context, 404, changed.error, "No such person")
            }
        }
    )

    .delete(
        "/users/:id",
        internalOnly,
        validated("param", user_path),
        async (context) => {
            const { id } = context.req.valid("param")
            const removed = await removeUser(context.var.database, {
                id,
                by: context.var.user.id
            })
            if (removed.ok) {
                console.info("Someone was removed", {
                    id,
                    by: context.var.user.id
                })
                return context.json({ removed: true as const }, 200)
            } else if (removed.error === "yourself") {
                return failure(
                    context,
                    409,
                    removed.error,
                    "Someone else removes you"
                )
            } else {
                return failure(context, 404, removed.error, "No such person")
            }
        }
    )
