# Designer Preflight

**A pre-launch check for websites and apps built with AI help.**

You've built something with Cursor, Claude Code, Codex, Lovable or Bolt. It looks right and it works on your laptop. But you don't know what a developer would spot in five minutes: a leaked key, a database anyone can read, a form that's unusable on an iPhone, three old copies of the header.

Designer Preflight checks for those things before you share your project. It explains every problem in plain English, asks before it changes anything, and fixes only what you approve.

It's free, open source (MIT), and built for Claude Code, Codex and Cursor.

## What you get

A clear answer: **ready to share**, **ready to share with care**, or **not ready yet**.

Then a report, sorted by what to do first. For each problem it tells you:

- **what's wrong**, in plain English;
- **why it matters** to the people using your site;
- **how to fix it**, and roughly how long that takes.

## What it checks

- 🔐 **Security:** leaked API keys (OpenAI, Stripe, Supabase and others), secret keys given names that publish them in the website, Supabase tables anyone can read or change, packages with known security problems, and package names that don't exist.
- 📱 **Phones:** Safari on iPhone and Chrome on Android. It catches pages that scroll sideways, form fields that make Safari zoom in, content cut off by `100vh`, buttons hidden by the iPhone home bar, and dates Safari can't read.
- ♿ **Accessibility:** WCAG 2.2 AA, using axe-core. Missing image descriptions, low contrast, unlabelled buttons and fields, blocked zoom, and keyboard problems.
- 🧹 **Leftovers from earlier versions:** old copies, `v2` folders, duplicate libraries, competing configs, placeholder text, and near-identical brand colours.
- 🌐 **Browser support:** modern CSS and JavaScript features that older iPhones and browsers don't support yet, checked against Baseline data.
- ⚡ **Speed and sharing:** heavy images, slow main content, layout jumps, page titles, descriptions, share images, favicons and 404 pages.

It also takes **before and after pictures** of every screen at phone, tablet and desktop sizes. After a fix, it highlights in red exactly what changed, so you can see nothing else broke.

## Get started

You need [Node.js](https://nodejs.org) 18 or newer and [git](https://git-scm.com). [Google Chrome](https://www.google.com/chrome/) is needed for the screen, phone and accessibility checks.

1. Download this repository and open a terminal in its folder.
2. Run:

   ```bash
   npm install
   npm run install-skill
   ```

   This makes the skill available to Claude Code, Codex and Cursor on this computer.
3. Open your project in your AI agent and ask: **"Run Designer Preflight on this project."**

The agent runs the checks (usually a few minutes), explains what it found, and asks which problems you want fixed.

## You stay in control

- **Nothing changes without your say-so.** You approve each fix, or tell it a problem is fine as it is.
- **Every fix can be undone.** Fixes go on a separate `preflight/` branch, one commit per fix.
- **Your keys stay private.** It looks for keys so it can warn you about them, but never prints a full key or sends one anywhere. It only contacts public vulnerability and package databases (OSV.dev and the npm registry), and sends them package names, never your code. Add `--no-network` to stop even that.
- **It's honest about its limits.** The report lists what it couldn't check, such as pages behind a login or real phones, and gives you a ten-minute check to do on your own phone.

## Works with FlowMap

[FlowMap](https://github.com/noellyonsgit/FlowMap) maps every screen and path in your app. With Designer Preflight installed, FlowMap gets a **Check** button:

- problems appear as badges on each screen;
- you approve fixes right on the board;
- an AI agent fixes only what you approved;
- you compare before-and-after pictures of every screen.

It works the other way too: Designer Preflight uses FlowMap's screen list when FlowMap is installed, so it checks every screen, not just the ones it can find by following links.

## Words used here

- **API key:** a password that lets your site use a paid service. If it leaks, anyone can spend your money.
- **Row level security (RLS):** the Supabase setting that stops visitors reading other people's data.
- **WCAG:** the international standard for websites that work for disabled people.
- **Branch:** a separate copy of your project's history, where changes can be tried and thrown away safely.

---

## For engineers

Designer Preflight has two parts that share one results file:

- **The `preflight` command** (`src/`) runs the automatic checks and writes the results.
- **The `designer-preflight` skill** (`skill/designer-preflight/`) tells any agent how to run the command, review the code for what automation can't see, talk to a designer, and apply approved fixes safely.

Run the command directly from this folder with `node src/cli.mjs`, or run `npm link` once to get `preflight` on your PATH:

```bash
preflight scan /path/to/project
preflight status . --json
preflight baseline . && preflight compare .
preflight help
```

Useful options: `--url` (check a running or live site), `--routes /,/pricing`, `--routes-from flowmap`, `--only security,devices`, `--no-build`, `--no-network`, `--no-runtime`, `--json`.

`preflight verdict` exits with code 2 for "not ready", so you can use it in CI.

**Results:** everything goes in `.preflight/` inside the checked project:

- `findings.json` (schema: [`schema/findings.schema.json`](schema/findings.schema.json));
- `approvals.json` and `progress.json`;
- `report.md`;
- `baseline/`, `current/` and `diff/` screenshots.

Each finding has a stable `key`, a phase, a severity (P0 to fix before sharing, P1 to fix soon, P2 to tidy up), a confidence level and a status. Only the skill edits project code. The command and FlowMap only read the project and write `.preflight/`.

**Checks** live in `src/checks/`: build, dependencies, secrets, leftovers, design drift, markup, browser support, and the Chrome runtime pass (axe-core, phone sizes, console and network errors, Core Web Vitals). Framework-specific guidance for Next.js, Vite + React, Vue, Svelte, Astro, static sites and Supabase is in `skill/designer-preflight/references/`.

**Install options:** `npm run install-skill -- --project <folder>` installs for one project only. `--copy` copies instead of linking. `--uninstall` removes it.

**Tests:** `npm test`. The `fixtures/` folder holds sample projects with known problems, and `skill/designer-preflight/evals/evals.json` lists the expected outcomes.

## For agents

Read [`skill/designer-preflight/SKILL.md`](skill/designer-preflight/SKILL.md). It follows the open [Agent Skills](https://agentskills.io) format and works in any agent that supports it.

## Credits and licence

Designer Preflight builds on other people's work: open-source agent skills and checklists, the GitHub Advisory Database, OSV.dev, W3C WebDX web-features, MDN browser-compat-data, axe-core, Puppeteer and pixelmatch. [CREDITS.md](CREDITS.md) lists every source, what was used, and its licence.

MIT licence. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
