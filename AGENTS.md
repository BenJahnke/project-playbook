# Working in this repo

Playbooks, doc templates and Claude Code skills shared across projects.
See [README.md](README.md) for the layout.

## This repo is public

Everything here must be project-agnostic. Before committing, check the
diff for anything that identifies a specific project or person: project
or product names, domains, Cloudflare account/zone/database IDs, bucket
names, emails, or incident details that point at one project. Use
`example.com`-style placeholders. "Learned the hard way on a previous
project" is fine; naming the project isn't.

**Commits here use the owner's GitHub noreply email**, not their real one
— commit metadata is public too. It's normally the global git email; on a
machine where it isn't, run `git config user.email "$(git log -1
--format=%ae)"` in the clone (copying the address the existing commits use)
before committing, and check `git log -1 --format='%ae %ce'` before
pushing. See the playbook's "GitHub repository security settings" section.

## Skills

- **Each skill is self-contained in its folder under `skills/`.** They're
  installed by linking each folder into `~/.claude/skills/`, so a path
  that reaches outside the skill's own folder (`../../something`) breaks
  once linked. Keep everything a skill needs inside its folder.
- A skill's `description` in `SKILL.md` frontmatter decides when it loads.
  Keep it specific to what the skill covers; a vague description makes it
  load for unrelated work.

## The playbook

- Put new material in the matching section. If it's security-relevant,
  also add a line to "Security checklist for a new project" at the top,
  linking to the section — and keep those anchor links valid when renaming
  headings.
- Date only external-state observations and tested claims ("as of
  <date>", "tested <date>"), per its "Docs structure" section.

## The template

- **Skeletons, not sample content.** Section headings plus
  `<!-- TODO(template): what goes here -->`, and `{{UPPER_CASE}}` for
  values the `new-project` skill fills in (uppercase, so they never
  collide with GitHub Actions' `${{ … }}` expressions). Invented example prose tends to
  survive into real projects as if it were fact.
- **Pre-fill only small rules that rarely change** (cost goal, branching,
  `npm run` over `npx`, the security guidelines) and descriptions of
  config the template itself ships. Anything long or still evolving
  belongs in the playbook, linked from the template.
- Mark sections that only apply to Cloudflare projects with "(Cloudflare)"
  in the heading; the `new-project` skill removes them for other stacks.
- If you add a placeholder or a stack-specific file, update
  `skills/new-project/SKILL.md` to match.
