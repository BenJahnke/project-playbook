# Security model

How this project is defended, the settings it depends on outside the repo,
and how to review or verify security-relevant changes.

- **Rules for writing new code** live in
  [AGENTS.md](../AGENTS.md#security-guidelines-for-new-work), "Security
  guidelines for new work" — kept there because it's the file every AI
  session reads automatically.
- **Generic versions of these patterns**, with the reasoning: the
  [Cloudflare playbook](https://github.com/BenJahnke/project-playbook/blob/main/skills/cloudflare-playbook/CLOUDFLARE-PLAYBOOK.md),
  starting with its security checklist.
- (Not named `SECURITY.md` on purpose: GitHub treats a file with that name
  in the root, `docs/` or `.github/` as the repo's *vulnerability-reporting
  policy*.)

**Last security review:** <!-- TODO(template): date, once there's been one. -->

## At a glance

| Area | Protection |
|---|---|
| Admin | <!-- TODO(template) --> |
| Browser | <!-- TODO(template) --> |
| Data / uploads | <!-- TODO(template) --> |
| Secrets | <!-- TODO(template) --> |
| Supply chain | Enforced install-script allowlist, 14-day release age, no git/tarball deps, signature checks in CI, SHA-pinned actions, Dependabot, approval gates on AI-agent installs |

## Admin access (Cloudflare)

<!-- TODO(template): how admin routes are locked — the Access application's destinations and policy, the in-app token check and the config vars it depends on — and confirmation that there's only one public hostname (workers_dev and preview_urls off). See the playbook's "Cloudflare Access" section. Delete if there's no admin area. -->

## Browser protections

<!-- TODO(template): the CSP (where it's set for each page type), security headers (middleware and public/_headers — keep them in sync), how URLs from data are checked, CSRF. See the playbook's "Security headers & CSP" section. -->

## Uploads

<!-- TODO(template): if users or admins upload files — how they're re-encoded, whether metadata stripping has been *tested* (and when), which sizes are served, and that storage is private. Delete if there are no uploads. -->

## Secrets and credentials

<!-- TODO(template): where secrets live (platform secrets, never committed config); the CI deploy token — what kind, its exact permissions, and anything it can reach beyond this project; the local CLI login policy. -->

## Supply chain

**npm policy** (committed `.npmrc`): `strict-allow-scripts=true` makes
package.json's `allowScripts` enforced rather than advisory;
`min-release-age=14` refuses versions published less than 14 days ago
(applies only when resolving new versions — `npm ci` installs the lockfile
as-is); `allow-git=none` and `allow-remote=none` block git and tarball
dependencies.

**Approved install scripts** (`allowScripts` in package.json):
<!-- TODO(template): each package, why it needs its script, and whether it's pinned to an exact version. -->

**CI pipeline** (`.github/workflows/deploy.yml`, on every non-Markdown
push to `main`): a guard step fails unless npm is ≥ 11.17 (older npm
silently ignores the `.npmrc` policy — hence the exact Node pin); `npm ci`;
`npm audit signatures`; type-check; build; deploy. Actions are pinned to
commit SHAs, not tags.

**Known audit findings**: <!-- TODO(template): any open `npm audit` findings and why they're acceptable (e.g. dev-only, unreachable). -->

**AI coding agents** need approval to fetch and run packages:
`.claude/settings.json` has `ask` rules for `npx`, `npm install`/`exec`/
`update`/`init`/`create` and their aliases, `pnpm dlx`, `yarn dlx` and
`bunx`. Routine commands go through `npm run` scripts.

## GitHub repository settings

<!-- TODO(template): as confirmed on <date> (Settings → Advanced Security) — what's on and off. Recommended: dependency graph, Dependabot alerts, malware alerts, security updates and grouped security updates on; see the playbook's "GitHub repository security settings" section. -->

**Version updates** come only from `.github/dependabot.yml`: weekly, npm
and GitHub Actions, PRs against `develop`, a 14-day cooldown matching
`min-release-age`, minor + patch npm updates grouped into one PR.
**Security-update PRs always target the default branch** — if that's
`main`, merging one deploys, so review them like any push to `main`.

## Procedures

### Reviewing a Dependabot PR

Follow the playbook ("Supply chain", "GitHub repository security
settings"): test the PR's `package.json` + `package-lock.json` on top of
current `develop` rather than the PR branch as-is, run the full check
(strict `npm ci`, `npm audit signatures`, type-check, build, a production
preview), then commit the tested result to `develop` yourself.

<!-- TODO(template): project-specific extra steps as you discover them (e.g. on Astro + Cloudflare, a wrangler bump needs workerd re-approved and @cloudflare/vite-plugin updated — see the playbook). -->

### Verifying security-relevant changes

<!-- TODO(template): how to test each protection against a production build, and how to prove the check is actually present before trusting a pass. -->

## History

<!-- Incidents and near-misses: what happened, how it was found, what fixed it. Empty is a good thing. -->
