---
name: new-project
description: Scaffold a new project's docs and baseline config from a template — AGENTS.md/CLAUDE.md, README, docs (PLAN, ARCHITECTURE, FEATURES, DESIGN, SECURITY-MODEL), an .npmrc supply-chain policy, Dependabot config, Claude Code permission rules, and for Cloudflare Workers projects a deploy workflow and static-asset security headers. Use when the user asks to start or scaffold a new project, or to add this doc structure to an existing repo.
---

# New project

Copies [template/](template/) into a project **once**. After that the
project owns its copy and the files diverge on purpose — this is the
opposite of the `cloudflare-playbook` skill, which projects reference
live and never copy.

## 1. Look before writing

- Confirm the target is the project's root (usually the current working
  directory) and check which template files already exist there.
- **Never overwrite an existing file.** For each collision, show what
  differs and ask whether to merge, skip, or replace.

## 2. Ask the user

Ask in one go, and skip anything already obvious from the repo:

1. Project name, and a one-sentence description of what it is and who it's
   for.
2. Is it deployed on Cloudflare Workers? (Default yes. If not, see step 3.)
3. The Cloudflare account ID, if they have it handy — not secret; it goes
   in the deploy workflow.

## 3. Copy and fill in

Copy everything under `template/`, keeping the relative paths
(`template/docs/PLAN.md` → `docs/PLAN.md`, dot-files included).

- Replace `{{PROJECT_NAME}}`, `{{ONE_LINER}}` and `{{CLOUDFLARE_ACCOUNT_ID}}`
  with the answers. Leave any you don't have as-is, so they're easy to
  find later. **Don't touch `${{ … }}`** in the workflow file — those are
  GitHub Actions expressions, not placeholders.
- **Leave `<!-- TODO(template): … -->` markers in place** unless the
  answers genuinely fill that section. Don't invent content to fill a
  section: an honest TODO beats plausible filler that reads as fact.
- **Not on Cloudflare Workers?** Skip `.github/workflows/deploy.yml` and
  `public/_headers`, and delete the parts of `AGENTS.md` and
  `docs/SECURITY-MODEL.md` whose headings are marked "(Cloudflare)".

## 4. Wire up package.json (if there is one)

The template can't ship a `package.json`, but the copied files assume a
few things about it:

- **Scripts** used by the deploy workflow and docs: `check`, `build`,
  `deploy`, a `wrangler` passthrough (`"wrangler": "wrangler"`), and
  `db:migrate:remote` if the project uses D1 — add whichever are missing.
- **`allowScripts`.** The copied `.npmrc` sets `strict-allow-scripts=true`,
  so the next `npm install`/`npm ci` fails until each package with an
  install script is reviewed and listed. Follow the playbook's "Supply
  chain" section to review each one (on this stack typically `esbuild`,
  `workerd@<exact version>`, and `"fsevents": false`), then run the
  install again.

## 5. Hand over

Finish with:

- **Remaining placeholders** — the output of searching the project for
  `TODO(template)` and the regex `\{\{[A-Z_]+\}\}` (uppercase only, so
  GitHub Actions' `${{ … }}` expressions don't show up).
- **Settings only the user can change**, with the playbook section for
  each:
  - GitHub: create a `develop` branch; in Settings → Advanced Security,
    turn on the dependency graph, Dependabot alerts, malware alerts,
    security updates and grouped security updates ("GitHub repository
    security settings").
  - Cloudflare (if deploying there): a `CLOUDFLARE_API_TOKEN` repo secret
    holding an Account API Token with separate account- and zone-scoped
    policies ("CI/CD & branching"); an Access application covering both
    `admin` and `admin/*` if there's an admin area ("Cloudflare Access").
  - Their user-level `~/.npmrc` should have `min-release-age` too, so
    `npx` outside the project is covered ("Supply chain").
  - If the repo is or will be **public**: set the repo-local git email to
    their GitHub noreply address before the first commit, so their real
    email never lands in public history ("GitHub repository security
    settings"). Offer to run the `git config` for them.
- If the project will handle anything security-relevant, point them at the
  playbook's "Security checklist for a new project".
