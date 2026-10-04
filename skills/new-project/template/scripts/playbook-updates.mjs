#!/usr/bin/env node
// SessionStart hook (.claude/settings.json): pulls the cloudflare-playbook
// skill's local clone and reports the playbook commits since this project
// last reviewed it, so each session starts by listing them for the user to
// prioritize. The last-reviewed commit lives in AGENTS.md ("Last reviewed:
// playbook commit `…`"); see its "Start of every session" section.
//
// Output is a SessionStart hook JSON object: `systemMessage` is a one-line
// notice for the user, `additionalContext` is the full list for Claude.
// Always exits 0 — a missing clone, no network, or a missing marker should
// never block a session from starting.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const playbookDir = join(homedir(), ".claude", "skills", "cloudflare-playbook");

function emit(systemMessage, additionalContext) {
  process.stdout.write(
    JSON.stringify({
      systemMessage,
      hookSpecificOutput: { hookEventName: "SessionStart", additionalContext },
    }),
  );
  process.exit(0);
}

// argv array, no shell — nothing here is ever interpolated into a command.
function git(...args) {
  return execFileSync("git", ["-C", playbookDir, ...args], {
    encoding: "utf8",
    timeout: 20_000,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

if (!existsSync(playbookDir)) {
  emit(
    "Playbook review skipped: the cloudflare-playbook skill isn't installed on this machine.",
    `Session-start playbook review skipped: ${playbookDir} doesn't exist. See https://github.com/BenJahnke/project-playbook for how to install the skill.`,
  );
}

let pullNote = "";
try {
  git("pull", "--ff-only", "--quiet");
} catch {
  pullNote = " (couldn't pull, maybe offline; using the local copy)";
}

const agents = existsSync(join(projectRoot, "AGENTS.md")) ? readFileSync(join(projectRoot, "AGENTS.md"), "utf8") : "";
const marker = agents.match(/Last reviewed: playbook commit `([0-9a-f]{7,40})`/)?.[1];

let head;
try {
  head = git("rev-parse", "--short", "HEAD");
} catch {
  emit("Playbook review skipped: couldn't read the playbook clone.", `Session-start playbook review skipped: git failed in ${playbookDir}.`);
}

if (!marker) {
  emit(
    `Playbook: no last-reviewed commit recorded in AGENTS.md${pullNote}.`,
    `AGENTS.md has no "Last reviewed: playbook commit \`…\`" line. Review the whole cloudflare-playbook once against this project, list what applies for the user to prioritize, then record the current playbook commit (${head}) in AGENTS.md.`,
  );
}

let commits;
try {
  commits = git("log", "--oneline", "--no-decorate", `${marker}..HEAD`, "--", ":/skills/");
} catch {
  emit(
    `Playbook: couldn't compare against the last-reviewed commit ${marker}${pullNote}.`,
    `git log ${marker}..HEAD failed in ${playbookDir} (unknown commit?). Check AGENTS.md's "Last reviewed" line against the playbook's history.`,
  );
}

if (!commits) {
  emit(
    `Playbook: no changes since the last review (${marker})${pullNote}.`,
    `The cloudflare-playbook has no changes under skills/ since this project's last review (${marker}); nothing to list.`,
  );
}

const count = commits.split("\n").length;
emit(
  `Playbook: ${count} new commit${count === 1 ? "" : "s"} since the last review${pullNote}. Claude will list them for you to prioritize.`,
  [
    `The cloudflare-playbook has ${count} new commit${count === 1 ? "" : "s"} under skills/ since this project last reviewed it (${marker}..${head}):`,
    commits,
    "",
    `Before other work, follow AGENTS.md's "Start of every session" section: read \`git -C ~/.claude/skills/cloudflare-playbook diff ${marker}..HEAD -- :/skills/\`, then give the user a short list of the changes. For each, say whether it applies to this project (already handled, needs work, or needs a decision) with a suggested priority, and let them choose what to tackle. Don't apply changes unprompted. Afterwards, record anything that applies but isn't done in PLAN.md and update the "Last reviewed" commit in AGENTS.md to ${head}.`,
  ].join("\n"),
);
