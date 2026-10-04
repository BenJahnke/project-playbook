---
name: cloudflare-playbook
description: Patterns, gotchas and a security checklist for small sites on Cloudflare Workers — Astro with @astrojs/cloudflare, D1 + Drizzle migrations, R2 + the Images binding, KV, Cloudflare Access for admin routes, wrangler.jsonc, observability (Workers Logs), Worker Previews, CSP/security headers, injection defenses (XSS, email HTML, SQL, open redirects, CSRF, input validation), npm supply-chain policy, Dependabot, and GitHub Actions deploys. Use when setting up, configuring, securing, deploying or debugging a project on this stack, or writing any route or form that handles user input.
---

# Cloudflare playbook

The full reference is [CLOUDFLARE-PLAYBOOK.md](CLOUDFLARE-PLAYBOOK.md) in
this directory. Read the section that matches the task rather than the
whole file; it's organized by topic.

- **Starting a project, or reviewing one's security**: begin with its
  "Security checklist for a new project" — each line links to the section
  with the reasoning.
- **Writing a route, form, redirect or email that touches user input**:
  read "Injection & input handling" first. These defenses are meant to be
  applied every time, not saved for an audit.
- **The project's own docs win.** Where a project's `AGENTS.md` or `docs/`
  records a deliberate deviation, follow the project.

## Adding to it

When a project hits a gotcha or pattern that would apply to *any* project
on this stack, add it to the playbook, not just the project's docs:

- **Project-agnostic wording only — the repo is public**
  (https://github.com/BenJahnke/project-playbook). No project names,
  domains, account or database IDs, bucket names, emails or incident
  details that identify a project; use `example.com`-style placeholders.
- Put it in the matching section; if it's security-relevant, also add a
  line to the checklist at the top, linking to the section.
- Date only external-state observations and tested claims ("as of
  <date>", "tested <date>"), per the playbook's "Docs structure" section.
- This skill directory is usually a link to a local clone of that repo,
  so edits here land in the clone — commit and push them there.
- **Write commit subjects that stand alone.** Projects scaffolded from the
  `new-project` template run a session-start hook that lists playbook
  commits since their last review, by subject line, for the user to
  prioritize. "Playbook: Turnstile tokens are single-use" helps; "update
  playbook" doesn't. Keep changes under `skills/`; that's the only path
  the hook watches.
