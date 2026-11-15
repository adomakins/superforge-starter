import {
    bucket,
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

    // The database's point-in-time recovery: Postgres sends every change
    // (its WAL) to this bucket as it happens, with a full backup each week
    // and a differential one each day, so it can be restored to any moment
    // in about the last four weeks, as a new service beside this one
    // (workbench/writing-code.md, "Restoring production"). Railway's
    // Postgres image archives whenever the `WAL_ARCHIVE_*` variables are set,
    // so these are what turn it on, from the first apply. They're the ones
    // `railway postgres pitr enable` sets (read from superforge's on
    // 2026-11-14). The bucket is in iad, beside the app's us-east4, where
    // Railway puts it.
    const recoveryArchive = bucket("Postgres-PITR", { region: "iad" })
    database.variables = {
        WAL_ARCHIVE_BUCKET: ref(recoveryArchive, "BUCKET"),
        WAL_ARCHIVE_ENDPOINT: ref(recoveryArchive, "ENDPOINT"),
        WAL_ARCHIVE_REGION: ref(recoveryArchive, "REGION"),
        WAL_ARCHIVE_KEY: ref(recoveryArchive, "ACCESS_KEY_ID"),
        WAL_ARCHIVE_SECRET: ref(recoveryArchive, "SECRET_ACCESS_KEY"),
        WAL_ARCHIVE_PATH: { type: "literal", value: "/pgbackrest" }
    }

    // Every file the app keeps, in one bucket with a folder for each kind of
    // file (source/database/storage/). Empty until something keeps one, and
    // an empty bucket costs next to nothing. One bucket rather than one per
    // kind, since Railway's buckets have no lifecycle rules, public access
    // or read-only keys to set apart, and the one app holds every key
    // anyway. In iad, beside the app's us-east4, since a bucket's region
    // can't change. It's only on the public network, so the app's uploads
    // count as its egress.
    const storage = bucket("Storage", { region: "iad" })

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
            DATABASE_URL: ref(database, "DATABASE_URL"),
            // The Storage bucket's S3 credentials. `BUCKET` is its name for
            // the S3 API, not "Storage"
            STORAGE_BUCKET: ref(storage, "BUCKET"),
            STORAGE_ENDPOINT: ref(storage, "ENDPOINT"),
            STORAGE_REGION: ref(storage, "REGION"),
            STORAGE_ACCESS_KEY_ID: ref(storage, "ACCESS_KEY_ID"),
            STORAGE_SECRET_ACCESS_KEY: ref(storage, "SECRET_ACCESS_KEY")
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
        resources: [app, database, recoveryArchive, storage]
    }
    return project("superforge-starter", definition)
})
