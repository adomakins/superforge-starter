# Railway

`railway.ts` is the Railway project as code: its region (`REGION`, which
the app, the database and the buckets share), the app service, its build,
pre-deploy migrations, start, healthcheck, CDN and variables, the
Postgres database with its point-in-time recovery bucket, and the
`Storage` bucket for the app's files. CI applies it on each push to
`main`; change Railway here, not in the dashboard.

```bash
railway config plan     # what applying it would change, without changing anything
railway config apply    # apply it (asks first; CI passes --yes)
```

Both need a checkout linked with `railway link`, or `RAILWAY_TOKEN`.
`workbench/commit-and-deploy.md` has the rest: how a deploy works, setting
Railway up for a new copy, domains, caching, and variables and secrets.
Railway's own reference for the file's language is
<https://docs.railway.com/infrastructure-as-code/reference>.
