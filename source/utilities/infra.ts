/**
 * Superforge Infra's API: what the server calls with the project's key
 * (backend/infra/), and what the pages send their events to with the
 * project's public ID (frontend/visitors/). A server can be pointed at
 * another Infra with `INFRA_URL`; the pages always send here.
 */
export const INFRA_URL = "https://infra.superforge.studio/v1"
