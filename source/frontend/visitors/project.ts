import { z } from "zod"
import superforge from "../../../.superforge/superforge.json"

// This app's project on Superforge Infra, by its public ID, which the
// pages send their events with. The Superforge MCP's `create_project`
// writes it into `.superforge/superforge.json`, beside the template and
// its version; until it has, the script records nothing and the banner
// never asks.

const superforge_file = z.object({
    project_id: z
        .string()
        .startsWith("sf_project_")
        .max(64)
        .regex(/^[\w-]+$/)
        .optional()
})

const parsed = superforge_file.safeParse(superforge)
if (!parsed.success) {
    console.warn(
        "Visitors: .superforge/superforge.json's project_id isn't a project's ID (sf_project_…), so nothing is recorded",
        { issues: parsed.error.issues }
    )
}

/** The project's public ID, `sf_project_…`, or null before there's one. */
export const PROJECT_ID =
    parsed.success && parsed.data.project_id !== undefined
        ? parsed.data.project_id
        : null
