import { pruneSessions } from "@/backend/auth/jobs"
import type { Job } from "./define"

/**
 * Every job there is, from each feature's `jobs.ts`: what
 * `GET /api/jobs` lists and `POST /api/jobs/:name` starts, whose workflows
 * WORKFLOWS registers (backend/workflows/index.ts). A new one goes here the
 * moment it's defined, and one that has shipped stays until no run of it
 * is left.
 */
export const JOBS: Job[] = [pruneSessions]
