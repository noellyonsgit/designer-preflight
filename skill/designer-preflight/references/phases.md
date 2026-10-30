# The phases in detail

Each phase lists what it is for (in plain words), what the automatic checks already cover, what you (the agent) still need to look at, and when the phase is done. Phase names match the `phase` field in findings.

## 0. Safety net (`safety`)

**For the designer:** "Before touching anything, I'm taking a snapshot so every change can be undone."

- Automatic: `baseline` saves screenshots of every screen at iPhone, Android, tablet and desktop sizes.
- You: make sure git exists and is clean, and create the `preflight/<date>` branch. Note the Node version, the package manager and whether dependencies are installed.
- Done when: there is a branch, a clean starting commit and (if Chrome is available) a visual baseline.

## 1. Understand the project (`map`)

**For the designer:** "Here's what I think your project is and does. Tell me if I've got anything wrong."

- Automatic: `doctor` and the `stack` section of `status --json` give the framework, styling, backends and AI libraries. FlowMap (if installed) gives screens, journeys, the "When it goes wrong" lane and "Other screens" that nothing links to.
- You: read the README, main layout and key screens. Work out the main user journey (for example browse, add to basket, pay) and who the users are.
- Done when: the designer has confirmed a three-to-five-sentence summary.

## 2. Does it build and run (`health`)

**For the designer:** "Checking that the project can actually be built and published, and that the main journey works."

- Automatic: install state, typecheck, lint, production build, tests, Node version pinning, `next lint` removed in Next.js 16, screens that fail to load, failed requests and crashes.
- You: read the code behind the main action and look for:
  - fake or stubbed behaviour, such as `setTimeout` pretending to save, hard-coded success messages or mock data in production paths;
  - forms that post nowhere;
  - buttons with no handler;
  - environment variables the code needs but nobody has set.
- Done when: the build passes, or the reason it fails is a finding, and the main journey has been traced end to end.

## 3. Leftovers from earlier versions (`leftovers`)

**For the designer:** "Projects built over several rounds of AI changes pick up old copies and duplicates that confuse future edits."

- Automatic:
  - copy-style file names, versioned folders and unused files;
  - duplicate component names and libraries that do the same job;
  - several lockfiles, stale configs and out-of-date agent rule files;
  - placeholder content and debug logging;
  - design drift: raw colours, one-off values, z-index and `!important` piles, extra breakpoints, fonts loaded twice.
- You: see `cruft.md`. Confirm with the designer before removing anything that might be intentional, such as a "v2" design they are still trying.
- Done when: every leftover is removed (on the branch), kept on purpose, or recorded as accepted.

## 4. Accessibility and good practice (`standards`)

**For the designer:** "Checking that people using keyboards, screen readers, zoom or larger text can use the site, and that it follows the framework's own rules."

- Automatic: axe-core on every screen at desktop and phone size, `lang`, titles, alt text, clickable non-buttons, removed focus outlines, positive tabindex, reduced motion and headings.
- You: the manual checklist in `accessibility.md` (keyboard walk-through, modals, menus, forms, error messages, motion), plus the framework conventions in the matching `framework-*.md`.
- Done when: no open P1 accessibility findings, or each is approved for fixing or consciously accepted.

## 5. Security and privacy (`security`)

**For the designer:** "Checking that private data, payments and API keys are protected, and that the packages the project uses have no known holes."

- Automatic:
  - known vulnerabilities (npm audit, which uses the GitHub Advisory Database, or OSV.dev);
  - packages that don't exist or look suspicious (slopsquatting);
  - secrets in code and in the built site, and `.env` files that are tracked or not ignored;
  - public source maps, secret names with public prefixes, remote Google Fonts;
  - live security headers (with `--url`).
- You: everything in `security.md`, especially who can call each API route or server action, database rules, payment webhooks and AI endpoint limits.
- Done when: no open P0s, and every server endpoint has been checked for authentication and authorisation.

## 6. Phones and browsers (`devices`)

**For the designer:** "Checking for the problems that only show up on iPhones, Android phones or particular browsers."

- Automatic: viewport, sideways scrolling on phones, input zoom, small tap targets, 100vh, safe areas, Safari date parsing, autoplay rules, sticky hover, and newer CSS and JavaScript features checked against your browser targets or Baseline "widely available" (web-features).
- You: the quirk list in `mobile-quirks.md`, especially keyboard-covered inputs, scroll locking in modals, in-app browsers (Instagram, TikTok) and iPhone photo uploads (HEIC).
- Done when: automatic findings are triaged, and the designer has the ten-minute real-phone script from the report.

## 7. Speed and search (`performance`)

**For the designer:** "Checking how fast pages appear on a phone, and how they look in search results and when shared."

- Automatic: heavy images, slow main content (LCP) and layout jumps (CLS) on an emulated phone, title, description, share image, favicon, robots.txt and sitemap. Speed numbers from a local server are hints only.
- You: third-party scripts (chat widgets, trackers, embeds), font loading, hero images loaded by JavaScript, and huge client bundles (`"use client"` on whole pages in Next.js).
- Done when: obvious weight is removed, and the designer knows to run PageSpeed Insights on the live URL. INP (responsiveness) can only be measured from real visitors, so do not claim to have measured it.

## 8. Empty, loading and error states (`states`)

**For the designer:** "Checking what visitors see when things are slow, empty, or go wrong."

- Automatic: crashes, console errors, failed requests, screens that error, and a missing or default 404 page.
- You: for each screen that loads data or submits a form, check what the visitor sees:
  - while it loads;
  - when there is nothing to show;
  - when the request fails or they are offline;
  - when they submit twice;
  - when their session has expired.

  Use FlowMap's "When it goes wrong" lane as a starting list.
- Done when: every data screen has a designed loading, empty and error state, or a finding says it doesn't.

## 9. Notes for the next person (`docs`)

**For the designer:** "Making sure the next person, or the next AI, can understand and run the project."

- Automatic: README missing or still the template, `.env.example` gaps, stale agent rule files.
- You: offer to write or update the README (what it is, how to run it, environment variable names, how it deploys), `.env.example` and agent rule files. Add comments only where the code is non-obvious.
- Done when: a new person could run the project from the README alone.

## 10. Fixes (`fixes`)

**For the designer:** "Here's what I suggest fixing, grouped and in order. Nothing changes until you say yes."

- See SKILL.md for the loop: group, explain, approve, fix one group, re-check, compare screenshots, commit, mark fixed.
- A **breaking change** is any change the designer did not approve that shows up on screen or in behaviour. The screenshot comparison and the re-run checks are how you catch it. If you cannot explain a changed screenshot, undo the change.
- Major version upgrades (for example Next 15 to 16, or Tailwind 3 to 4) are always their own group, with their own approval and a full re-check.

## 11. Verdict

- **NO-SHIP:** an open P0 that has not been consciously accepted.
- **PASS WITH RISKS:** open P1s, or accepted risks above P2.
- **PASS:** otherwise. Even then, the designer should do the real-phone check.

---

Sources:
- [arc `audit` skill](https://github.com/howells/arc/blob/main/skills/audit/SKILL.md) by howells (MIT): checks that need no AI run before judgement calls.
- [vibe-to-prod](https://github.com/osmanio2/vibe-to-prod) by osmanio2 (Apache-2.0): production-readiness areas.
- [vibecoded-site-audit-skill](https://github.com/sstanley-yelnatss/vibecoded-site-audit-skill) by sstanley-yelnatss (MIT): common mistakes on AI-built sites.
- [frontend-code-review](https://github.com/DNM03/frontend-code-review) by DNM03 (MIT): loading, empty and error states as review items.
- [Front-End-Checklist](https://github.com/thedaviddias/Front-End-Checklist) by David Dias (MIT).
- [web.dev Core Web Vitals](https://web.dev/articles/vitals).
- [web-features](https://github.com/web-platform-dx/web-features) (Apache-2.0).
