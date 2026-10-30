# Reporting to the designer

`report .` writes `.preflight/report.md` automatically from the findings. This file is about what **you** say in chat at the end of a run, and the words to use throughout.

## The final message

Keep it short and in this order:

1. **The verdict in one sentence**, with what it means. For example: "Ready to share with care: nothing is blocking, but there are 4 things worth fixing soon."
2. **What changed:** the fix groups you applied, in plain words, and which screens look different (point to `.preflight/diff/` for the pictures).
3. **What is left, and why it matters:** most urgent first, one line each. Say which ones they decided to accept.
4. **What only they can do:** for example rotating a key in a dashboard, setting a header in the host, or checking the Supabase Security Advisor. Give numbered steps.
5. **The ten-minute phone check** (it is in the report), and a reminder that emulated phones are not real phones.
6. **Where things are:**
   - the full report in `.preflight/report.md`;
   - every change on the `preflight/<date>` branch;
   - how to merge it when they are happy (or offer to do it).

Do not paste the full findings list into chat. Do not use severity codes without saying what they mean.

## Writing a finding

- `what`: one sentence a designer understands, about the effect, not the code. Prefer "Phone visitors can't close the menu" over "Missing onClick on .nav-close".
- `why`: who it affects and how badly.
- `fix`: what will change, and roughly how. Mention a file only if it helps.
- Technical detail goes in `evidence`. The report shows it under "Details for developers".

## Glossary (use these explanations the first time a term comes up)

| Term | Plain explanation |
| --- | --- |
| P0 / P1 / P2 | How urgent a problem is. P0 means fix before sharing; P1 means fix soon; P2 means tidy up when you can. |
| Verdict | NO-SHIP (not ready), PASS WITH RISKS (ready with care), PASS (ready). |
| Branch | A separate copy of the project's history where changes are made safely; nothing affects the main version until it is merged. |
| Commit | A saved checkpoint of changes, with a description, that can be undone. |
| Build | Turning the project files into the finished site that gets published. |
| Lint / linter | An automatic proofreader for code. |
| Type check | An automatic check that pieces of code fit together correctly (TypeScript). |
| Dependency / package | Code written by other people that the project downloads and uses. |
| Lockfile | The list of exact versions of every package, so every install gets the same code. |
| Vulnerability (CVE, GHSA) | A publicly known security hole in a package, with an ID you can look up. |
| Slopsquatting | Attackers publishing packages under names AI tools tend to invent, so that installing a "hallucinated" package installs malware. |
| Environment variable / `.env` | Settings and secret keys kept outside the code, set separately on each computer and on the host. |
| API key / secret | A password that lets code use a paid or private service. |
| Server / client | The server is the computer that sends the site; the client is the visitor's browser. Anything in the client can be read by anyone. |
| API route / endpoint | An address on the server that the app calls to get or save data. |
| Row-level security (RLS) | Database rules that decide which rows each visitor may see or change. |
| Accessibility (a11y) | Making the site usable with screen readers, keyboards, zoom and other assistive tools. |
| Screen reader | Software that reads the screen aloud (VoiceOver on Apple devices, TalkBack on Android). |
| Viewport | The visible area of the page in the browser window or on the phone screen. |
| Baseline | A W3C label for web features. "Widely available" means it has worked in all major browsers for at least 2.5 years. |
| LCP / CLS / INP | Google's speed measures: how fast the main content appears, how much the layout jumps, and how quickly the page responds to taps. |
| 404 page | The page shown when an address doesn't exist. |
| Rate limit | A cap on how often someone can use a feature, to stop abuse and runaway costs. |

---

Sources:
- Report structure from this project's plan.
- Verdict tiers inspired by [code-sentinel](https://github.com/tnramalho/code-sentinel) (MIT) and the [production-checklist skill](https://byshawnchee.vercel.app/projects/preflight-skill) (idea only).
- [preflight-scout](https://github.com/fenutech/preflight-scout) (AGPL-3.0, idea only): never claim an unexecuted check passed.
- [web-features Baseline](https://web-platform-dx.github.io/web-features/).
- [web.dev Core Web Vitals](https://web.dev/articles/vitals).
