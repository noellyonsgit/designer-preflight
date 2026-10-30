# Security and privacy review

The automatic scan covers known vulnerable packages, suspicious packages, leaked keys, `.env` files and live headers. This file covers what only reading the code can find. AI-built apps most often fail on the **server side**: the screens look finished, but the data behind them is open to anyone.

When you explain a finding to the designer, describe the real-world consequence ("anyone could see every customer's address"), not the mechanism ("missing authorisation middleware").

## 1. Who can call each server endpoint (most important)

List every server entry point:
- API routes (`app/api/**/route.ts`, `pages/api/**`, `src/routes/**/+server.ts`, `server/api/**`);
- server actions (`"use server"`), SvelteKit form actions, Astro actions and endpoints;
- edge and serverless functions (`supabase/functions`, `netlify/functions`, `api/` on Vercel).

For each one, check:
- **Authentication:** does it check that someone is signed in, *on the server*, inside the handler? Hiding a button or redirecting in the browser is not protection.
- **Authorisation:** does it check that this person may touch *this* record? For example, `orders.where({ id })` without `userId` lets anyone read any order by changing the ID. This is the most common serious bug.
- **Admin areas:** admin pages protected only by a client-side check or a secret URL are open to anyone.
- **Middleware alone is not enough.** Next.js middleware/proxy could be bypassed (CVE-2025-29927). Check the session again in the route or action itself.
- **Server actions are public endpoints.** Anyone can call them directly with any arguments, so validate input and check the user inside every action.

Severity: data of other users reachable means **P0**.

## 2. Database rules

- **Supabase:** see `framework-supabase.md`. Row-level security must be on for every table the browser can reach.
- **Firebase:** look at `firestore.rules` and `storage.rules` for `allow read, write: if true` or rules that only check `request.auth != null` (that means any signed-in user can read every record).
- **SQL and ORMs:** raw queries built with string concatenation (`` `SELECT … ${input}` ``) are injectable. Use parameters or the ORM.

## 3. Payments

- Prices and totals must come from the server or the payment provider, never from values the browser sends.
- Stripe webhooks must verify the signature (`stripe.webhooks.constructEvent` with the raw body and the webhook secret). Otherwise anyone can fake "payment succeeded".
- Fulfil orders from the webhook, not from the success page, because visitors can open the success page without paying.
- Live keys (`sk_live_`) only on the server; test and live keys must not be mixed up between environments.

## 4. User input and content

- Validate input on the server (for example with zod or valibot), including type, length and allowed values.
- **Raw HTML from users or AI is a script-injection risk.** Look for `dangerouslySetInnerHTML`, `v-html`, `{@html}`, `set:html`, `innerHTML =`, and markdown rendered to HTML. Sanitise with DOMPurify, or render as text.
- File uploads:
  - check type and size on the server;
  - store them outside public folders, or in private buckets;
  - never trust the file name;
  - photos from iPhones arrive as HEIC.
- Redirects such as `?next=` or `?returnTo=` must only allow your own paths (an "open redirect" helps phishing).
- Contact, sign-up and password-reset forms need rate limiting or a bot check, or they become spam relays.

## 5. AI features

- Model API keys (OpenAI, Anthropic, Google, Replicate) must only be used on the server. Never put them behind a `NEXT_PUBLIC_`, `VITE_`, `PUBLIC_` or `EXPO_PUBLIC_` prefix.
- Every endpoint that calls a model needs:
  - **authentication or a strict rate limit**;
  - a **maximum input size**;
  - a **spending cap** set in the provider dashboard.

  An open AI endpoint can run up a bill of thousands overnight.
- Treat model output as untrusted: do not render it as raw HTML, and do not run it as code or SQL.
- **Prompt injection:** text from users, web pages or files can override your instructions. If the model can call tools (send email, query the database, browse), limit those tools to the current user's own data, and confirm any destructive action with the user.
- Do not put secrets, other users' data or internal instructions in prompts you would not want the user to see.

## 6. Browser and network settings

- CORS: `Access-Control-Allow-Origin: *` on endpoints that use cookies or return private data lets any website read them.
- Cookies holding sessions should be `HttpOnly`, `Secure` and `SameSite=Lax` (or `Strict`). Do not keep tokens in `localStorage` if you can avoid it.
- Security headers (checked automatically on live URLs): Content-Security-Policy, Strict-Transport-Security, X-Content-Type-Options, frame-ancestors or X-Frame-Options, Referrer-Policy. Suggest a report-only CSP first.
- Error pages and API errors must not show stack traces, SQL or internal paths in production.

## 7. Packages (supply chain)

- The scan flags packages with known vulnerabilities, packages missing from npm (often AI-hallucinated names), and new or barely-used packages. Check each suspicious package's npm page and repository before keeping it.
- Fix vulnerabilities with `npm audit fix` (never `--force`) or by upgrading the direct dependency. Group major upgrades separately and re-run everything.
- Keep exactly one lockfile, and commit it.
- Be wary of packages with install scripts (`postinstall`) that you did not choose deliberately.

## 8. Privacy and consent (UK and EU visitors especially)

- Analytics, ad pixels, session recorders and chat widgets that set cookies or track visitors need consent first (UK PECR and GDPR, EU ePrivacy). Check that they do not load before consent.
- Loading Google Fonts from Google's servers sends visitors' IP addresses to Google. A German court fined a site for this in 2022. Self-host the fonts (for example with `next/font` or `@fontsource`).
- There should be a privacy policy if the site collects any personal data (forms, accounts, analytics).
- Do not log personal data (emails, addresses, tokens) to the console or to logging services.

## 9. If a key has leaked

Explain to the designer, step by step:
1. Create a new key in the provider's dashboard.
2. Put it in the hosting environment variables, and in the local `.env`.
3. Revoke the old key.
4. Remove the old key from the code.

Rotating the key is the fix. Deleting the file is not enough, because the key stays in git history and in any copy already pushed. If the repository is public, assume the key has already been found.

---

Sources:
- [OWASP Top 10](https://owasp.org/www-project-top-ten/) and [OWASP Top 10 for LLM Applications](https://genai.owasp.org/llm-top-10/).
- [OWASP Secure Headers Project](https://owasp.org/www-project-secure-headers/).
- [Next.js security advisory for CVE-2025-29927](https://nextjs.org/blog/cve-2025-29927).
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security).
- [Stripe webhook signatures](https://docs.stripe.com/webhooks#verify-events).
- [vibecoded-site-audit-skill](https://github.com/sstanley-yelnatss/vibecoded-site-audit-skill) by sstanley-yelnatss (MIT).
- [code-sentinel](https://github.com/tnramalho/code-sentinel) by tnramalho (MIT): AI security dimension.
- [Claude-Security-Audit](https://github.com/Netropolitan/Claude-Security-Audit) by Netropolitan (MIT): fixing one change at a time with checkpoints.
- Socket's [slopsquatting research](https://socket.dev/blog/slopsquatting-targets-across-frontier-llms).
- LG München I, 20 January 2022, 3 O 17493/20 (Google Fonts and GDPR).
