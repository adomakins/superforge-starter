import type { Workflow } from "./define"

/**
 * Every workflow there is, from each feature's `workflows.ts`, registered
 * with DBOS before it launches (engine.ts). A workflow left out of this
 * list never runs, and starting one throws, so a new one goes here the
 * moment it's defined:
 *
 *   import { notifyOwner } from "@/backend/contacts/workflows"
 *
 *   export const WORKFLOWS: Workflow[] = [notifyOwner]
 *
 * One that has shipped stays listed until no run of it is left (README.md,
 * "Changing a workflow").
 */
export const WORKFLOWS: Workflow[] = []
