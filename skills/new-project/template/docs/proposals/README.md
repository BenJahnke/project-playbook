# Proposals

One file per idea that needs a decision before anything gets built
(`<topic>.md`). Each one is self-contained, with the questions included,
so it can be reviewed on its own, including by someone who doesn't read
the code. [PLAN.md](../PLAN.md)'s open questions link to it in one line;
nothing else restates it.

Once it's decided, update the status line with the outcome and why, add
the decision to PLAN.md's Resolved decisions, and document whatever gets
built in FEATURES.md and AGENTS.md. Leave the file as the record of why.

## Format

```markdown
# Proposal: <short name>

**Status:** proposed, waiting on <who/what>. | Decided: <outcome>, because <why>.

## The idea
What it is and who it's for, in plain language. A mock-up or example if
it helps.

## Options
Each realistic way to do it, with its tradeoffs.

**Recommendation:** which option, and why.

## Questions to answer
Numbered, each saying what it decides.

## Technical notes
For whoever builds it: data sources, schema, security and cost checks
still to do (verify free tiers before committing).
```
