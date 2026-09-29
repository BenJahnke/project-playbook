# project-playbook

Playbooks, doc templates and Claude Code skills for starting and running
my projects.

## What's here

Two kinds of files, with opposite lifecycles:

| | What | Lifecycle |
|---|---|---|
| [`skills/cloudflare-playbook/`](skills/cloudflare-playbook/) | [CLOUDFLARE-PLAYBOOK.md](skills/cloudflare-playbook/CLOUDFLARE-PLAYBOOK.md): patterns, gotchas and a security checklist for small sites on Cloudflare Workers (Astro, D1, R2, KV, Access, CI/CD, supply chain) | **Referenced, never copied.** Every project reads the latest version, so a fix made here reaches all of them. |
| [`skills/new-project/`](skills/new-project/) | A [template](skills/new-project/template/) for a new project: doc skeletons (`AGENTS.md`, `PLAN`, `ARCHITECTURE`, `FEATURES`, `DESIGN`, `SECURITY-MODEL`) and baseline config (an `.npmrc` supply-chain policy, Dependabot, Claude Code permission rules, and for Cloudflare projects a deploy workflow and security headers) | **Copied once**, then the project owns it and it diverges on purpose. |

The template's `.github/` files live under `skills/new-project/template/`,
so GitHub never runs them here — only a repo's root `.github/` is active.

## Using it with Claude Code

Each folder under `skills/` is a Claude Code skill. Link them into your
user-level skills folder and every project on the machine can use them —
the playbook loads when a task involves the stack, and `/new-project`
scaffolds a repo.

**Windows** (PowerShell; directory junctions need no admin rights):

```powershell
$clone = "<path to your clone>"
New-Item -ItemType Directory -Force "$HOME\.claude\skills" | Out-Null
New-Item -ItemType Junction -Path "$HOME\.claude\skills\cloudflare-playbook" -Target "$clone\skills\cloudflare-playbook"
New-Item -ItemType Junction -Path "$HOME\.claude\skills\new-project" -Target "$clone\skills\new-project"
```

**macOS / Linux:**

```sh
mkdir -p ~/.claude/skills
ln -s "<path to your clone>/skills/cloudflare-playbook" ~/.claude/skills/cloudflare-playbook
ln -s "<path to your clone>/skills/new-project" ~/.claude/skills/new-project
```

Because they're links, edits in the clone take effect immediately, and
`git pull` picks up changes made elsewhere. Each skill is self-contained
in its folder, which is what makes linking them individually work.

In each project, point to the playbook from its `AGENTS.md` (the template
already does), so sessions without these skills installed, and other AI
tools, can still find it.

**Without Claude Code:** read the playbook here on GitHub, and copy
`skills/new-project/template/` into a new repo by hand, then search it for
`TODO(template)` and `{{UPPERCASE}}` placeholders (leave the workflow's
`${{ … }}` GitHub Actions expressions alone).

## Contributing back

When a project hits a gotcha that would apply to any project on the stack,
add it to the playbook in project-agnostic terms. This repo is public:
no project names, domains, account or database IDs, bucket names or
emails. See [AGENTS.md](AGENTS.md).

## License

[CC0 1.0](LICENSE) — public domain. Use anything here, no attribution
needed.
