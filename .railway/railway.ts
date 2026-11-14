import {
    defineRailway,
    github,
    postgres,
    project,
    ref,
    service
} from "railway/iac"

/**
 * The Railway project, as code. `railway config plan` shows what applying
 * it would change and `railway config apply` changes it (README.md here);
 * Railway doesn't read it as it deploys. CI applies it on each push to
 * `main` (.github/workflows/ci.yml), so change Railway here, not in the
 * dashboard. It manages every service variable, so one set in the
 * dashboard and missing here is a deletion, which CI's apply refuses: a
 * secret goes in as `preserve()`, which keeps Railway's value.
 *
 * START-HERE.md names the project, the service and the repository below
 * for the business, and makes the project with the first apply
 * (workbench/commit-and-deploy.md, "Setting up Railway").
 */
export default defineRailway(() => {
    const region = "us-east4-eqdc4a"

    // The database, reachable only on the private network
    // (source/database/). Railway gives it its volume.
    const database = postgres("Postgres", { region })
    database.networking = { privateNetworkEndpoint: "postgres" }

    // The app: one Node server (source/node.ts), which deploys each push to
    // `main` once its CI passes (`checkSuites`). Named for what it is, so a
    // copy keeps the name; the project and the repository are the business's.
    const app = service("app", {
        source: github("superforge-studio/starter-template", {
            branch: "main",
            checkSuites: true
        }),
        build: {
            builder: "RAILPACK",
            buildEnvironment: "V3",
            buildCommand: "pnpm build"
        },
        start: "pnpm start",
        // The database's pending migrations, in one transaction, before the
        // new deployment starts, while the one before still serves
        // (source/database/migrate.ts). One that fails rolls back and stops
        // the deploy. The timeout sits above the migrations' own statement
        // limit, so a slow one rolls back rather than being killed.
        preDeploy: "pnpm database:migrate",
        deploy: { preDeployTimeoutSeconds: 300 },
        // Traffic moves to a new deployment only once the server reaches
        // the database
        healthcheck: "/api/health",
        replicas: { [region]: 1 },
        // Railway's CDN in front of the app: the pages for a day at most, and
        // only until the next deploy, which purges every page (`html`), and
        // the hashed assets for good, by the headers source/node.ts sends
        // (workbench/commit-and-deploy.md, "Caching"). Nothing under /api is
        // kept. `html` is Railway's default, written out so it can't change
        // under us.
        cdn: { enabled: true, purgeOnDeploy: "html" },
        env: {
            DATABASE_URL: ref(database, "DATABASE_URL")
        }
    })
    // Railway's own address for the app, which the first apply makes with
    // the service, since the CDN needs a public domain to start on. After
    // that the file doesn't keep it: if it's deleted, the plan doesn't
    // notice. A custom domain joins it under `customDomains`
    // (workbench/commit-and-deploy.md, "Domains").
    app.networking = {
        serviceDomains: { "superforge-starter.up.railway.app": {} }
    }

    // `variables` is what the CLI reads to manage them, but the SDK's type
    // doesn't have it yet (railway 3.17.0), so it's passed as a variable,
    // which TypeScript checks without refusing the extra key
    const definition = {
        variables: { managed: true },
        resources: [app, database]
    }
    return project("superforge-starter", definition)
})
