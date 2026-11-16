/**
 * The parts coming to Foundation, in the order they're expected to ship:
 * DBOS workflows first (TASK-1689), then sign-in through Superforge Infra,
 * then the dashboard, which needs sign-in. Every direction shows them from
 * this one list, so they read the same everywhere: `what` beside a name
 * that says what it's made with, `whatInFull` where nothing else does.
 */
export const PLANNED_PARTS = [
    {
        name: "Workflows",
        kind: "DBOS",
        what: "Background work that picks up where it stopped.",
        whatInFull: "Background work that picks up where it stopped, on DBOS.",
        path: "source/backend/workflows/"
    },
    {
        name: "Sign-in",
        kind: "Superforge Infra",
        what: "Your customers and staff sign in.",
        whatInFull:
            "Your customers and staff sign in, through Superforge Infra.",
        path: ".superforge/superforge.json"
    },
    {
        name: "Dashboard",
        kind: null,
        what: "Who can sign in, and the work running in the background.",
        whatInFull: "Who can sign in, and the work running in the background.",
        path: "source/frontend/routes/dashboard/"
    }
] as const
