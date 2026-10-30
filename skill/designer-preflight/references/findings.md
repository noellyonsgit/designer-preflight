# Writing a finding

Findings live in `.preflight/findings.json`. The CLI writes its own; you add yours with:

```bash
node <skill>/scripts/run.mjs add --finding '<json>'
```

You can also pipe a JSON object or array into `add`. The designer reads `what`, `why` and `fix` directly (in chat, in the report and in FlowMap), so write them in plain language. Technical detail goes in `evidence`.

## Example

```json
{
  "id": "security.unprotected-api",
  "phase": "security",
  "severity": "P0",
  "confidence": "verified",
  "file": "app/api/orders/route.ts",
  "line": 8,
  "screen": "/account/orders",
  "what": "Anyone can download every order, without signing in.",
  "why": "The orders address does not check who is asking, so customer names and addresses are public to anyone who finds it.",
  "fix": "Check the signed-in user at the top of the route and return only their own orders.",
  "effort": "30 min",
  "evidence": "GET /api/orders returns all rows; no session check before db.order.findMany()",
  "source": ["references/security.md"]
}
```

## Fields

- `id` (required): `<area>.<short-name>`, lower case. Reuse the same id for the same kind of problem.
- `phase` (required): `safety`, `map`, `health`, `leftovers`, `standards`, `security`, `devices`, `performance`, `states`, `docs` or `fixes`.
- `severity` (required):
  - **P0:** could leak data, lose money, or break the site for many people. Fix before sharing.
  - **P1:** affects real people, such as phone, keyboard or screen-reader users, or search. Fix soon.
  - **P2:** worth tidying.
- `confidence`:
  - `verified`: you proved it (ran it, or read the code path end to end).
  - `needs-human`: likely, but someone should check.
  - `human-only`: a judgement call, such as wording, brand or business rules.
- `what` (required): one sentence about the effect, not the code.
- `why` (required): who is affected and how badly.
- `fix`: what will change, and roughly how.
- `effort`: `5 min`, `30 min`, `half a day` or `1 day+`.
- `file`, `line`, `screen` (a route such as `/checkout`) and `screens` (a list): where it is.
- `evidence`: technical detail for developers (no secret values).
- `source`: where the rule comes from (a reference file, a standard or a credited project).

Each finding gets a stable `key` (a fingerprint of id, file, screen and line). Use that key with `mark` to record decisions. Adding the same finding twice updates it rather than duplicating it.

## Statuses

- `open`: found, no decision yet.
- `approved`: the designer said yes, fix it (also written to `.preflight/approvals.json`).
- `fixed`: the fix is in and the re-check passed.
- `accepted-risk`: the designer chose to live with it. Always add `--note` with their reason.
