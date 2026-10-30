---
name: designer-preflight
description: Designer Preflight, a pre-flight check for a vibe-coded website or app before it is shared or launched. Use when a designer or non-developer asks to "run Designer Preflight", "check my project", "is this ready to launch", "pre-flight", "clean up my vibe-coded app", "make it production ready", or wants a review of security, accessibility, mobile (Safari on iPhone, Chrome on Android), leftovers from earlier versions, performance or code quality. Runs automatic checks, explains every problem in plain language, asks before changing anything, and fixes approved problems one group at a time with before-and-after screenshots.
license: MIT
compatibility: Built for Claude Code, Codex and Cursor (any agent that supports Agent Skills). Needs Node.js 18+ and git. Google Chrome is optional but needed for screen, accessibility and phone checks. FlowMap is optional.
metadata:
  version: "0.1.0"
  homepage: https://github.com/noellyonsgit/designer-preflight
  credits: https://github.com/noellyonsgit/designer-preflight/blob/main/CREDITS.md
---

# Designer Preflight

**In plain words:** this skill checks a website or app that was built with AI help, the way a careful developer would before launch. It finds security holes, broken or inaccessible screens, phone problems, leftovers from earlier versions, and missing basics. It explains each one in plain language, asks before changing anything, and then fixes what the designer approves, one group at a time, checking that nothing else broke.

The person you are working with is most likely a **designer, not a developer**. Everything you say to them must make sense without coding knowledge.

## How to talk to the designer

- Lead with what it means for their users ("people on iPhones can't tap the menu"), then what to do. Put technical detail after, or leave it out.
- Spell out terms the first time: "a lockfile (the list of exact package versions)". `references/report.md` has a glossary you can reuse.
- Ask one decision at a time. Offer clear choices, with your recommendation first. Use your structured question tool if you have one; otherwise give numbered options.
- Never make them read a diff to make a decision. Describe the change and what they will see.
- Be honest about limits: say what was **not** checked, and that emulated phones are not real phones.

## Ground rules (never break these)

1. **Ask before you change anything.** Nothing is edited, deleted, installed or upgraded without the designer's approval of that group of fixes.
2. **Work on a branch.** All changes go on a `preflight/<date>` git branch, one commit per approved group. Never push, deploy or merge unless asked.
3. **Never run `npm audit fix --force`** or upgrade a major version without saying so first. Major upgrades are their own approved group.
4. **Never print a secret in full.** Refer to keys by name and the first few characters. Never move a secret value into another file; tell the designer how to rotate it.
5. **Never delete what you cannot prove is unused.** "Leftovers" are confirmed with the designer first, and deleted on the branch so they can be recovered.
6. **Use `scripts/run.mjs` for every check that needs a browser**, not your own browser tool. It gives the same results in every agent.
7. **Record everything in `.preflight/`** using the commands below, so another agent (or FlowMap) can pick up where you left off.
8. **Fix the cause, not the symptom.** For example, don't block zoom to hide the iPhone input-zoom problem; make the inputs 16px.

## The tools

Run every command from the project folder. `<skill>` is the folder this file is in.

| Command | What it does |
| --- | --- |
| `node <skill>/scripts/run.mjs doctor` | Shows what this computer can check (Chrome, git, FlowMap, optional scanners). |
| `node <skill>/scripts/run.mjs scan . --json` | Runs every automatic check (build, packages, secrets, leftovers, design drift, markup, browser support, and every screen in Chrome at desktop, iPhone and Android sizes). Saves `.preflight/findings.json` and `.preflight/report.md`. Takes 1 to 5 minutes. |
| `node <skill>/scripts/run.mjs scan . --only <phases> --json` | Re-runs only some phases, for example `--only security,devices`. |
| `node <skill>/scripts/run.mjs baseline .` | Screenshots every screen at 4 sizes before any fixes. |
| `node <skill>/scripts/run.mjs compare .` | Screenshots again and lists every screen that changed, with red-highlighted diff images in `.preflight/diff/`. |
| `node <skill>/scripts/run.mjs add --finding '<json>'` | Records a problem you found by reading the code (see "Adding your own findings"). |
| `node <skill>/scripts/run.mjs mark <key...> --status approved\|fixed\|accepted-risk\|open [--note "…"]` | Records a decision or a fix. |
| `node <skill>/scripts/run.mjs status . --json` | Shows the current verdict, counts and progress. |
| `node <skill>/scripts/run.mjs report .` | Rewrites the plain-language report. |

Useful options: `--url http://localhost:3000` (use a site that is already running, or the live site to check security headers), `--routes /,/pricing` (only these screens), `--routes-from flowmap`, `--no-build`, `--no-network`, `--no-runtime`.

These commands are all you need. Don't read the engine's source code to work out how they behave; `run.mjs help` lists every option.

If the CLI cannot run at all, say so plainly, then do the phases by reading the code, using the reference files. Mark every finding as `needs-human`.

## Starting, resuming and modes

1. Run `doctor`. Read `.preflight/progress.json` if it exists. If phases are already done, tell the designer what was done last time and continue from the next phase rather than starting again.
2. Decide the mode:
   - **Interactive (normal):** you are chatting with the designer. Follow all phases and ask for approvals in chat.
   - **Propose (headless):** you were started with `--from-flowmap propose`, or with no one to talk to. Do phases 0 to 9 **without editing project files** (only `.preflight/` may change), write clear `fix` text on every finding, then stop. FlowMap shows the findings to the designer for approval.
   - **Apply (headless):** you were started with `--from-flowmap apply`. Read `.preflight/approvals.json` and fix **only** the approved finding keys, following phase 10. Do nothing else.
3. If you were started from FlowMap (`--from-flowmap`), FlowMap has already mapped the screens: use `--routes-from flowmap`, and do not start FlowMap yourself.

## The phases

Work through these in order. After each phase, briefly tell the designer what you found, in one or two sentences, before moving on. Each phase's detail is in `references/phases.md`.

### 0. Safety net

- If the folder is not a git repository, explain why version history matters ("so every change can be undone") and offer to create one with a first commit. Do not continue with fixes without git.
- If there are uncommitted changes, ask whether to commit them first as "Work before pre-flight".
- Create the `preflight/<yyyy-mm-dd>` branch.
- Run `baseline` (if Chrome is available) so there are "before" pictures of every screen.

### 1. Understand the project

- If FlowMap is installed and you were not started from it, run `flowmap map . --json` for the screen list and the "When it goes wrong" and "Other screens" evidence.
- Read `package.json`, the README, the main layout and two or three main screens.
- Tell the designer, in three to five plain sentences, what the app does, how it is built (framework, styling, data, payments, AI features) and how many screens it has. Ask them to correct anything wrong. Their answer changes what matters (a portfolio is not a shop).
- Read the matching framework file: `references/framework-next.md`, `references/framework-vite-react.md`, `references/framework-vue.md`, `references/framework-svelte.md`, `references/framework-astro.md` or `references/framework-static.md`. If the app uses Supabase, also read `references/framework-supabase.md`.

### 2 to 8. Automatic checks, then your review

1. Run `scan . --json`. Use `--url` if the designer already has the site running.
2. Read the findings. Sanity-check anything surprising by opening the file. If a finding is wrong, mark it `accepted-risk` with a note explaining why it is a false alarm.
3. Do the review the tool cannot do, using the reference file for each phase. Add what you find with `add`:
   - **2. Health:** does the main journey actually work? Read the code for the primary action (sign up, checkout, contact form, generate). Is anything stubbed, faked or hard-coded?
   - **3. Leftovers from earlier versions** (`references/cruft.md`): duplicate components doing the same job, abandoned routes, dead feature flags, two ways of doing the same thing, out-of-date agent rule files.
   - **4. Standards** (`references/accessibility.md`): keyboard use of menus, modals and custom controls; focus order; headings; forms; motion. Follow the framework's own conventions.
   - **5. Security** (`references/security.md`): every API route and server action checks who is calling; database rules (Supabase RLS); payment webhooks are verified; AI endpoints have rate limits and spending caps; uploads are checked; user content is not inserted as raw HTML; cookie consent and privacy policy if there is tracking.
   - **6. Phones and browsers** (`references/mobile-quirks.md`): go through the quirk list against the code.
   - **7. Speed and search:** heavy images, fonts, third-party scripts, titles, descriptions, share images.
   - **8. Empty, loading and error states:** for each screen that loads data, what does the visitor see while it loads, when there is nothing, and when it fails? Use FlowMap's "When it goes wrong" lane if you have it.

### 9. Notes for the next person

- The README should say what the project is, how to run it, the environment variables it needs (names only) and how it is deployed. Offer to write or update it.
- `.env.example` should list every variable name with no real values.
- AI agent rule files (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.cursor/rules`) must describe the project as it is now. Out-of-date rules make future AI edits worse.
- Add comments only where the code does something non-obvious (a workaround, a business rule, a browser quirk). Do not comment every function.

### 10. Fixes

1. Run `status . --json` and group the open findings into fix groups that make sense to a designer, most urgent first. Example groups: "Lock down the leaked Stripe key", "Make the forms work for screen readers", "Phone layout fixes", "Remove leftovers from version 1".
2. For each group, tell the designer:
   - what will change, and what they will see differently (usually nothing, or a specific change);
   - the risk ("low: text colour only", or "medium: upgrades the framework");
   - how long it will take.

   Then ask: approve, skip, or accept the risk. Mark the decision with `mark`. Use `accepted-risk` with their reason when they choose to live with it.
3. Fix one approved group at a time:
   - Make the smallest change that fixes the cause. Follow the project's existing style and the framework's conventions.
   - Re-run the build and the affected checks (`scan . --only <phases> --json`). The finding should disappear; mark it `fixed`.
   - Run `compare .` and look at what changed. **Any visual change you did not intend is a breaking change: undo or fix it before continuing.** Tell the designer which screens changed and show them the diff images for intended visual changes.
   - Commit with a plain message such as "Pre-flight: label the newsletter form for screen readers".
4. Things only a person can do (rotating a key in Stripe, setting a header in the hosting dashboard, testing on a real phone) go into a short to-do list for the designer, with step-by-step instructions.

### 11. Verdict

- Run `report .` and `status . --json`. The verdict is **NO-SHIP** if any P0 is open, **PASS WITH RISKS** if P1s are open or risks were accepted, and **PASS** otherwise.
- Tell the designer the verdict in one sentence, then: what you fixed, what is left and why it matters, what they must do themselves, and the ten-minute phone check in `.preflight/report.md`.
- Point them to `.preflight/report.md` for the full list. Mention that the `preflight/` branch holds every change, and how to merge it when they are happy.

## Adding your own findings

Use `add` for problems you find by reading the code. The designer reads `what`, `why` and `fix` directly, so write them in plain language. Fields, an example and the severity scale are in `references/findings.md`.

## Reference files

Read the reference file for a phase when you reach it. Each one ends with its sources.

- `references/phases.md`: what each phase checks in detail, and what "done" means.
- `references/findings.md`: how to write a finding, with an example and the severity scale.
- `references/security.md`: server-side and AI-era security checks.
- `references/accessibility.md`: the manual accessibility checklist beyond the automatic checks.
- `references/mobile-quirks.md`: known Safari-on-iPhone and Chrome-on-Android problems, with fixes.
- `references/cruft.md`: how to spot and safely remove leftovers from earlier versions.
- `references/framework-*.md`: conventions for Next.js, Vite + React, Vue, Svelte, Astro, plain HTML and Supabase.
- `references/report.md`: how to write the final summary, plus a glossary of plain-language terms.
