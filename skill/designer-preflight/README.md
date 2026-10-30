# Designer Preflight (agent skill)

**A pre-launch check for websites and apps built with AI help.** You ask your AI agent "run Designer Preflight on this project" (or just "run a pre-flight check"). It checks the project the way an experienced developer would, explains every problem in plain language, asks before changing anything, and then fixes what you approve, with before-and-after screenshots so you can see nothing else broke.

It is built for **Claude Code, Codex and Cursor**, using the open [Agent Skills](https://agentskills.io) format.

## What it checks

- **Security:** leaked API keys, open databases, unprotected pages and APIs, packages with known holes, made-up package names.
- **Accessibility:** screen readers, keyboard use, contrast, labels and focus.
- **Phones:** Safari on iPhone and Chrome on Android, including layouts that scroll sideways, fields that zoom, and bars hidden by the notch.
- **Leftovers** from earlier versions: old copies, duplicate libraries, design drift.
- **Basics:** does it build, speed, search and sharing previews, error and empty states, and notes for the next person.

At the end you get a verdict (**NO-SHIP**, **PASS WITH RISKS** or **PASS**) and a plain-language report in `.preflight/report.md`.

## Install

From a copy of the [Designer Preflight repository](https://github.com/noellyonsgit/designer-preflight):

```bash
npm install
npm run install-skill
```

This links the skill into `~/.agents/skills` (Codex and Cursor) and `~/.claude/skills` (Claude Code). Add `-- --project /path/to/project` to install it for one project only.

You also need [Node.js](https://nodejs.org) 18 or newer and git. [Google Chrome](https://www.google.com/chrome/) is optional, but without it the screen, accessibility and phone checks can't run.

## Safety notes

- The skill never changes your project without asking. Every approved fix is a separate commit on a `preflight/` branch, so it can be undone.
- It looks for secrets (API keys, `.env` files) **so it can warn you if they are exposed**. It never prints a full key, never copies key values anywhere, and never sends them off your computer. Automated skill scanners may flag this "secret access" by design.
- The only network calls are to public vulnerability and package databases (OSV.dev and the npm registry). These receive package names and versions, never your code. Use `--no-network` to turn them off.

## For engineers

- `SKILL.md` holds the instructions agents follow. `references/` holds the per-phase and per-framework detail, loaded on demand.
- `scripts/run.mjs` finds the `preflight` CLI (in this repository, on your PATH, or via `npx designer-preflight`) and runs it, so results are identical in every agent.
- `evals/evals.json` lists the test prompts and the expected outcomes against the repository's `fixtures/`.

Licence: MIT. Credits: see [CREDITS.md](https://github.com/noellyonsgit/designer-preflight/blob/main/CREDITS.md) in the repository.
