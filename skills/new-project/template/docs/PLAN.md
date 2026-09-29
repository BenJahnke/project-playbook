# Plan

## What this is

<!-- TODO(template): what the project is, who it's for, and the one thing it has to do well. A few sentences. If the framing changes later, say what it changed from and why. -->

## Status

<!-- TODO(template): where things stand — live or not, what's built, what's left. Keep this current: it's the file to re-read after time away. -->

**Branching**: day-to-day work happens on `develop`; `main` only moves
when `develop` is merged into it and pushed, which is the deploy trigger.
Direct merge is fine for a single-developer project — no PR needed.

## Resolved decisions

<!-- One bullet per decision: the decision in bold, then why. Keep reversals and what they replaced — the "why" is what stops a future session from relitigating it. -->

- **Minimize cost — target $0/month.** Prefer the free-tier option for
  every service, verified against its pricing page (see the cost table in
  [ARCHITECTURE.md](ARCHITECTURE.md#cost)), and flag anything that isn't
  one before adding it. The one unavoidable cost is the domain.
  <!-- TODO(template): delete if the project has a budget. -->

## Open questions

<!-- Undecided things, each with what the decision depends on. Move them to Resolved decisions once settled. -->

## How to pick this back up

Read this file first, then [FEATURES.md](FEATURES.md) for what's in
scope, [ARCHITECTURE.md](ARCHITECTURE.md) for the stack and data model,
[DESIGN.md](DESIGN.md) for visual/brand direction, and
[SECURITY-MODEL.md](SECURITY-MODEL.md) for the security design, settings
and procedures. Patterns and gotchas for the stack are in the
[Cloudflare playbook](https://github.com/BenJahnke/project-playbook/blob/main/skills/cloudflare-playbook/CLOUDFLARE-PLAYBOOK.md).
