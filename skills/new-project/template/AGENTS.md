# {{PROJECT_NAME}}

{{ONE_LINER}}

## Cost

Explicit goal: **$0/month**, aside from the domain. Before adding any new
external service or upgrading a product tier, check that it has a free
tier covering expected usage (or flag it explicitly if it doesn't) rather
than assuming it's fine. Verified numbers live in the cost table in
docs/ARCHITECTURE.md.

<!-- TODO(template): delete or change this section if the project has a budget. -->

## Playbook

This project follows the Cloudflare playbook — loaded automatically as the
`cloudflare-playbook` skill, or read it at
https://github.com/BenJahnke/project-playbook/blob/main/skills/cloudflare-playbook/CLOUDFLARE-PLAYBOOK.md.
Anything in this file or `docs/` overrides it. When you hit a gotcha that
would apply to *any* project on this stack, add it to the playbook as well
(project-agnostic wording only — that repo is public).

## Development

<!-- TODO(template): how to start the dev server, run checks, and work with the database. -->

**Run tools through `npm run`, not `npx`.** `npm run` only executes
locally installed binaries; `npx` falls back to downloading from the
registry, so `.claude/settings.json` makes it (and `npm install`/`exec`/
`init`/`create`, etc.) prompt for approval. Adding a dependency is a
deliberate, approved step — see "Security guidelines for new work" below.

**Branching**: day-to-day work happens on `develop`. `main` only moves
when `develop` is merged into it, and a push to `main` deploys, so ask
before pushing to `main` exactly as you'd ask before deploying. Don't
commit directly to `main`.

### Local wrangler is logged out by default (Cloudflare)

Deploys and remote migrations run in CI with their own scoped token; a
logged-in wrangler leaves a broad, account-wide OAuth token on disk for
any local package to read. Anything `--remote` from a dev machine fails
with "You are not authenticated" until the user runs
`npm run wrangler -- login` — ask them to, and to
`npm run wrangler -- logout` afterwards. Local dev needs no login.

## Structure

<!-- TODO(template): routes/pages and where their code lives, the data model in a line or two, and any non-obvious conventions (e.g. how multi-action forms are wired). Keep it to what an agent needs every session; details go in docs/. -->

## Security model

The design, the settings it depends on, and step-by-step procedures are in
[docs/SECURITY-MODEL.md](docs/SECURITY-MODEL.md). **Read it before**
touching auth, CSP/headers, uploads, `.npmrc`/`allowScripts` or the deploy
workflow — and before reviewing a Dependabot PR or adding a dependency.

### Security guidelines for new work

- **Secrets are platform secrets, never committed config.** On Cloudflare
  that means `wrangler secret put`, never `vars` — `vars` are committed and
  re-pushed on every deploy.
- **Any URL from the database or a form that ends up in an `href`/`src`
  is scheme-checked** (`https:` only).
- **Headers in middleware: merge, never overwrite** — especially
  `Content-Security-Policy`, which the framework may already have set.
- **New dependencies need a reason and approval**, go in through
  `npm install` (which prompts), and get checked: real package
  (`npm view <pkg> repository.url maintainers`), no unexpected install
  scripts, `npm audit signatures` clean.
- **Test security changes against a production build, and prove the
  check is actually present** before trusting "zero violations" or "all
  pass" — a page with no CSP also reports zero CSP violations.

#### Stack-specific (Cloudflare)

- **Anything that writes goes under one admin prefix** (`/admin`, with
  any API routes at `/admin/api/...`) — both Cloudflare Access and the
  in-app token check key on it; a mutating route anywhere else is public.
- **Never disable the in-app Access token check to test** — local dev
  already skips it.
- **No inline event handlers, `style=` attributes, or `set:html`** — the
  CSP forbids the first two; Astro escapes everything else and `set:html`
  bypasses that. Use `data-` attributes plus the component's `<script>`.
- **Uploaded images are re-encoded before storage**, served only through
  the app's image route at a fixed set of widths, and the bucket stays
  private — so metadata (GPS) can't leak and nobody can burn through the
  transform quota.

<!-- TODO(template): add project-specific rules as they come up. -->

## Docs conventions

- **Date only what git can't supply**: observations of state outside the
  repo (dashboard settings, pricing, third-party support — "as of <date>")
  and tested-vs-assumed claims ("tested <date>"). Never "added <date>" or
  "deployed <date>".
- **Mark owner preferences as such** in decisions (e.g. "(owner's call)"),
  so they aren't mistaken for technical constraints and "fixed" later.
- **Parked ideas are labeled**, in FEATURES.md's "Parked ideas" section,
  rather than half-built or forgotten.

## Gotchas worth remembering

<!-- TODO(template): project-specific gotchas as you hit them — symptom, cause, fix. Generic ones go in the playbook instead. -->
