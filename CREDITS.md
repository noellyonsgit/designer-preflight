# Credits

Designer Preflight stands on other people's work. This file lists every project, specification, tool and dataset it borrows from, what was taken, and under which licence. If you spot a missing or wrong credit, please open an issue.

How each source was used:

- **Idea**: the approach or a check influenced ours. No text or code was copied.
- **Adapted**: wording, checklists or structure were adapted, with the original licence notice kept in [NOTICE](NOTICE).
- **Runtime**: installed as a dependency, or run as an external tool when present.
- **Data**: a dataset queried or bundled at run time.

Licences were checked on 30 October 2026 against each repository's licence file and the GitHub and npm registries.

## Agent skills and checklists

| Source | Author | Licence | Used as | What we took |
|---|---|---|---|---|
| [vibe-code-cleanup](https://github.com/sickn33/agentic-awesome-skills/blob/main/skills/vibe-code-cleanup/SKILL.md) in agentic-awesome-skills | Whoisabhishekadhikari, collected by sickn33 | MIT | Adapted | "Surgery, not demolition" stance: only remove what is provably unused, validate after every batch, revert a batch that breaks the build, and leave routes, API contracts, auth and schemas alone. |
| [vibecoded-site-audit-skill](https://github.com/sstanley-yelnatss/vibecoded-site-audit-skill) | sstanley-yelnatss | MIT | Adapted | List of mistakes common on AI-built sites: default titles, missing Open Graph data, public source maps, client-only admin checks, tokens in localStorage, Supabase without row-level security or with the service key in the browser. Report-first, no silent refactors. |
| [arc `audit` skill](https://github.com/howells/arc/blob/main/skills/audit/SKILL.md) (archived) | howells | MIT | Idea | Run mechanical checks (build, types, lint, tests, secrets) before judgment-based review; gate security depth on launch signals. |
| [code-sentinel](https://github.com/tnramalho/code-sentinel) | tnramalho | MIT | Idea | Release verdict tiers and the AI/LLM security dimension (prompt injection, context leakage, tool abuse). |
| [can-i-use skill](https://github.com/ivklgn/ai-kit/blob/main/skills/can-i-use/SKILL.md) in ai-kit | ivklgn | MIT | Adapted | Resolve the project's real browser targets first, fall back to Baseline "widely available", and give SAFE / NEEDS FALLBACK / UNSAFE verdicts with a named fallback. |
| [safari-webkit-skill](https://github.com/K8Cill/safari-webkit-skill) | K8Cill | MIT | Adapted | Safari and iPhone bug patterns: date-string parsing, 16px input zoom, autoplay needing `muted` and `playsinline`, `-webkit-backdrop-filter`, soft-keyboard layout shifts. |
| [corbat-skills](https://github.com/corbat-tech/corbat-skills) | corbat-tech | MIT | Idea | Separating read-only review, prioritised fixing, and a "preflight" that validates without releasing. |
| [Front-End-Checklist](https://github.com/thedaviddias/Front-End-Checklist) | David Dias and contributors | MIT | Adapted | Pre-launch items for HTML head, SEO, images, accessibility and performance, with priorities. |
| [SkillPreflight](https://github.com/agent-contracts/skill-preflight) | agent-contracts | MIT | Runtime (development) | Used to scan this skill for unsafe commands, token weight and maintainability before release. |
| [claude-deep-review](https://github.com/iron-ham/claude-deep-review) | Iron-Ham | MIT | Idea | Silent-failure hunting and comment-accuracy checks as review dimensions. |
| [Claude-Security-Audit](https://github.com/Netropolitan/Claude-Security-Audit) | Netropolitan | MIT | Idea | Fixes planned with blast radius and applied one at a time with checkpoints and independent verification. |
| [accessibility-excellence](https://github.com/sanky369/vibe-building-skills/blob/main/skills/frontend-design/accessibility-excellence/SKILL.md) in vibe-building-skills | sanky369 | MIT | Adapted | Semantic HTML first, ARIA last; the clickable-div ratio as a health signal; default target WCAG 2.2 AA; state plainly what was not verified. |
| [frontend-code-review](https://github.com/DNM03/frontend-code-review) | DNM03 | MIT | Idea | Loading, empty, error and disabled states as first-class review items. |
| [code-review-skill](https://github.com/awesome-skills/code-review-skill) | awesome-skills | MIT | Idea | Progressive disclosure: a short core skill with per-framework guides loaded on demand. |
| [vibe-to-prod](https://github.com/osmanio2/vibe-to-prod) | osmanio2 | Apache-2.0 | Idea | Production-readiness areas for people between "vibe coder" and engineer: environments, error tracking, documentation, agent-readiness. |
| [Agent Skills specification](https://agentskills.io/specification) ([repo](https://github.com/agentskills/agentskills)) | Agent Skills contributors | Apache-2.0 | Adapted | The `SKILL.md` format, frontmatter fields, progressive disclosure and size guidance this skill follows. |
| [fitness review skills](https://github.com/jeffabailey/skills) | Jeff Bailey | Unlicense | Idea | Scored review per domain with file and line evidence. |
| [awesome-cursor-skills](https://github.com/spencerpauly/awesome-cursor-skills) | Spencer Pauly and contributors | CC0-1.0 | Idea | Accessibility auditing through the accessibility tree and browser verification loops. |
| [preflight-scout](https://github.com/fenutech/preflight-scout) | fenutech | AGPL-3.0 | Idea only | Never claim an unexecuted check passed. Because of AGPL, no text or code was copied. |
| [Asymmetric-al/core accessibility-review](https://github.com/Asymmetric-al/core/blob/develop/.cursor/skills/accessibility-review/SKILL.md) | Asymmetric-al | AGPL-3.0 | Idea only | An axe pass does not prove keyboard order, focus quality or label usefulness, so keep a manual pass. No text or code was copied. |
| [AccessLint skills](https://github.com/AccessLint/skills) | AccessLint | No licence file | Idea only | Grading each finding by evidence basis (verified, confirm with a human, human-required). Linked and credited; nothing copied. |
| [ios-safari-quirks](https://github.com/ssv445/claude-skills/blob/main/ios-safari-quirks/SKILL.md) in claude-skills | ssv445 | No licence file | Idea only | Pointer to iOS Safari behaviours worth checking (Intelligent Tracking Prevention storage limits, user-activation rules). Linked and credited; nothing copied. |
| [production-checklist skill](https://byshawnchee.vercel.app/projects/preflight-skill) | Shawn Chee | Not stated | Idea only | Stack auto-detection with PASS / FAIL / MANUAL items and a ship / no-ship verdict. Linked and credited; nothing copied. |
| [code-change-verification](https://github.com/aiagentskills/skills/tree/main/skills/code-change-verification) | aiagentskills | No licence file | Idea only | Propose targeted verification for each change. Linked and credited; nothing copied. |

## Research

- Socket, [slopsquatting targets across frontier LLMs](https://socket.dev/blog/slopsquatting-targets-across-frontier-llms) (2026), and Churilov, [arXiv:2605.17062](https://arxiv.org/abs/2605.17062). These are the basis for the hallucinated-package checks (package age, release count, registry existence).
- Tim Schipper, [Slopsquatting: checking that the package exists is not a defence](https://tim-schipper.nl/en/blog/slopsquatting-ai-hallucinated-packages). This is the basis for looking at age and release history, not only existence.
- W3C, [WCAG 2.2](https://www.w3.org/TR/WCAG22/). Accessibility success criteria, including target size (2.5.8).

## Runtime tools and data

| Tool or data | Licence | Used for |
|---|---|---|
| [axe-core](https://github.com/dequelabs/axe-core) by Deque Systems | MPL-2.0, used unmodified | Automated accessibility rules run in each captured page. |
| [Puppeteer](https://github.com/puppeteer/puppeteer) (`puppeteer-core`) | Apache-2.0 | Driving the user's installed Chrome for screenshots and runtime checks. |
| [pixelmatch](https://github.com/mapbox/pixelmatch) by Mapbox | ISC | Before-and-after screenshot comparison. |
| [pngjs](https://github.com/pngjs/pngjs) | MIT | Reading and writing screenshots for comparison. |
| [web-features](https://github.com/web-platform-dx/web-features) by the W3C WebDX Community Group | Apache-2.0 | Baseline status and per-browser support, including Safari on iOS and Chrome on Android. |
| [MDN browser-compat-data](https://github.com/mdn/browser-compat-data) | CC0-1.0 | The support data web-features is built from. |
| [OSV.dev](https://osv.dev) API by Google ([osv-scanner](https://github.com/google/osv-scanner)) | Apache-2.0 (code); data under each source's terms | Known vulnerabilities for dependencies. |
| [GitHub Advisory Database](https://github.com/advisories) via `npm audit` | CC-BY-4.0 | Known vulnerabilities reported by the package manager. |
| [npm registry](https://registry.npmjs.org) | Registry metadata | Package age, release count and existence. |
| [gitleaks](https://github.com/gitleaks/gitleaks) | MIT | Optional: secrets in git history, when installed. |
| [@accesslint/cli](https://www.npmjs.com/package/@accesslint/cli) | MIT | Optional: a second accessibility engine, when installed. |

## Companion project

- [FlowMap](https://github.com/noellyonsgit/FlowMap) (MIT, same authors). Provides screen maps, journeys, screenshots and visit counts when installed.
