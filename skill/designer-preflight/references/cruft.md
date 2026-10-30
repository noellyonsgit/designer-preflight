# Leftovers from earlier versions

Projects built through several rounds of AI prompting collect leftovers:
- old copies of components;
- a second styling approach;
- a library added and then replaced;
- routes nobody links to;
- rules files describing a framework the project no longer uses.

Leftovers matter because **future AI edits read them**. An agent that finds `Header.tsx` and `HeaderNew.tsx` may edit the wrong one.

Approach: surgery, not demolition. Only remove what you can prove is unused, remove it in small batches, re-check after each batch, and undo a batch that breaks anything.

## What counts as a leftover

- **Copies:** `Button-old.tsx`, `HeroCopy.jsx`, `page (2).tsx`, `v2/` folders, `backup/`, `legacy/` *(scanned)*.
- **Orphans:** files nothing imports, and screens nothing links to *(scanned for files; FlowMap's "Other screens" lane shows screens)*.
- **Doubles:** two libraries for the same job, such as two icon sets, two date libraries, or two animation libraries *(scanned)*; two components doing the same thing under different names (you need to read them); two styling systems (Tailwind plus CSS modules plus styled-components).
- **Stale configuration:** several lockfiles, a `tailwind.config.js` under Tailwind v4, two ESLint configs, two bundlers *(scanned)*.
- **Out-of-date agent rules:** `AGENTS.md`, `CLAUDE.md`, `.cursorrules` or `.cursor/rules` mentioning frameworks, folders or conventions that no longer exist *(partly scanned)*. Update them to match the project as it is.
- **Debug leftovers:** `console.log`, commented-out blocks of code, `TODO` piles, test pages (`/test`, `/demo`, `/playground`), placeholder text and images *(partly scanned)*.
- **Design drift:** raw hex colours instead of tokens, one-off pixel values, near-duplicate colours, a pile of z-index values and `!important`, extra breakpoints *(scanned)*.

## Proving something is unused

Before proposing removal, check all of these:
1. Search for the file name and its export names across the project, including dynamic imports (`import()`, `lazy()`), string references, route configs, CMS content and `public/` paths.
2. For routes and pages: the framework may use the file without any import (Next.js `app/` files, SvelteKit `+page`, Astro `pages/`). A page nobody links to may still be visited from email, ads or bookmarks. Ask the designer.
3. For packages: check config files, scripts and command-line use, not just `import` statements.
4. If in doubt, mark it `needs-human` and ask.

## How to present leftovers to the designer

Group them so the decision is easy. For example: "There are 3 old versions of the header, 2 icon libraries, and 14 unused images. Removing them doesn't change anything on screen. Shall I remove them?" Mention that the removal happens on the `preflight/` branch and can be undone.

Ask specifically about things that may be intentional:
- a "v2" design they are still exploring;
- a test page they use;
- placeholder text waiting for a copywriter.

## Design drift: consolidating, not redesigning

- Collect the raw colours. Near-duplicates (for example `#1a1a1a` and `#1b1b1b`) usually mean "the same colour, typed twice". Propose one token per colour and show the designer the palette before changing anything.
- Do not change how anything looks while consolidating. The screenshot comparison should show no change. If it does, the "duplicate" was not really a duplicate: ask.
- Tailwind v4 keeps tokens in CSS with `@theme`. Tailwind v3 keeps them in `tailwind.config.js`. Plain CSS uses custom properties on `:root`.

## Removing safely

1. One batch per kind of leftover (copies, packages, unused files, config).
2. After each batch: build, typecheck, the affected scan phases, and `compare`.
3. Commit with a plain message ("Pre-flight: remove 3 unused header copies").
4. If anything changes unexpectedly, undo that batch and mark the items `needs-human`.

---

Sources:
- [vibe-code-cleanup](https://github.com/sickn33/agentic-awesome-skills/blob/main/skills/vibe-code-cleanup/SKILL.md) by Whoisabhishekadhikari, collected in sickn33/agentic-awesome-skills (MIT): the "surgery, not demolition" approach, batch-and-validate, and leaving routes, contracts, auth and schemas alone.
- [Knip](https://knip.dev): ideas for finding unused files and dependencies.
- [Tailwind CSS v4 theme variables](https://tailwindcss.com/docs/theme).
