# {{PROJECT_NAME}}

{{ONE_LINER}}

<!-- TODO(template): the live URL, once there is one. -->

See [docs/PLAN.md](docs/PLAN.md) to get oriented; the rest of `docs/`
covers architecture, security ([docs/SECURITY-MODEL.md](docs/SECURITY-MODEL.md)),
feature scope, and design direction.

## Development

Needs **Node 24.19+** (its npm is what enforces the supply-chain policy in
`.npmrc` — older npm silently ignores it).

```
npm ci        # install exactly what's in the lockfile
npm run dev
```

<!-- TODO(template): any other setup steps, e.g. local database migrations or seed data. -->

Use `npm ci`, not `npm install`, for setup — `npm install` re-resolves
versions instead of installing the reviewed lockfile. Run tools through
`npm run` scripts rather than `npx`.

See [AGENTS.md](AGENTS.md) for the development workflow. Pushing to `main`
deploys (via GitHub Actions); day-to-day work happens on `develop`.
