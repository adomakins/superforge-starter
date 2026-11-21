import { z } from "zod"

/**
 * What someone on the team lets Claude do in the app, as they allow it on
 * the Allow page: `read`, the API's `GET` routes, and `act`, everything
 * else they could do themselves, but sign anyone in or out. The API
 * enforces both on every call Claude makes (backend/auth/signed-in.ts).
 */
export const AGENT_SCOPES = ["read", "act"] as const

export const agent_scope = z.enum(AGENT_SCOPES)

export type AgentScope = z.infer<typeof agent_scope>

/** What the Allow page sends: what Claude may do, of what it asked */
export const agent_allow = z.object({
    scopes: z.array(agent_scope).min(1)
})
