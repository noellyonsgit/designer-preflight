# Next.js

Check `next` in `package.json` (and `node_modules/next/package.json`) for the version. Most projects made since 2024 use the **App Router** (`app/`); older ones use the Pages Router (`pages/`). Some have both, which is often a leftover.

## Conventions to follow

- **Server first.** Components are server components unless the file starts with `"use client"`. Keep `"use client"` on the smallest interactive pieces, not on whole pages or layouts. AI often adds it to everything, which sends far more JavaScript to phones.
- **Data and secrets:**
  - Only variables starting `NEXT_PUBLIC_` reach the browser. Anything secret must not have that prefix.
  - Import `server-only` in files that must never run in the browser.
- **Server actions** (`"use server"`) are public endpoints. Check the user and validate input inside every action.
- **Middleware / proxy:** Next.js 16 renamed `middleware.ts` to `proxy.ts`. Never rely on it alone for authentication (CVE-2025-29927). Check again in routes and actions.
- **Metadata:**
  - Use the `metadata` export or `generateMetadata` in layouts and pages, not hand-written `<head>` tags.
  - File conventions provide icons and share images: `app/icon.png`, `app/apple-icon.png`, `app/opengraph-image.png`, `app/robots.ts` and `app/sitemap.ts`.
- **Images:**
  - Use `next/image` with `width` and `height` (or `fill` with a sized parent) and `sizes`.
  - Add `priority` only on the main above-the-fold image.
  - Keep `images.remotePatterns` tight, and avoid wildcard hosts.
- **Fonts:** use `next/font`. It self-hosts the font, which avoids the Google Fonts privacy problem and layout jumps. Don't also load the same font with a `<link>`.
- **Loading and errors:**
  - `loading.tsx` gives each route segment an instant loading state.
  - `error.tsx` (a client component) catches errors per segment.
  - `not-found.tsx` gives a designed 404.
  - `global-error.tsx` covers the root layout.

  Missing ones are phase 8 findings.
- **Links:** use `next/link` for internal navigation, and plain `<a>` for external links.

## Version notes

- **Next.js 16:**
  - `next lint` was removed. Run ESLint (or Biome) directly through a `lint` script (the scan flags this).
  - Turbopack is the default bundler.
  - `middleware` became `proxy`.
  - Request APIs such as `cookies()`, `headers()` and `params` are async only.
- **Next.js 15:**
  - `params`, `searchParams`, `cookies()` and `headers()` became async.
  - Caching of `fetch` and GET route handlers became opt-in.
  - React 19 is required.
- Keep `next` and `react` patched. The scan reports known vulnerabilities; React Server Components had critical advisories in 2025.
- Major upgrades (for example 14 to 15, or 15 to 16) are their own fix group. The official codemods (`npx @next/codemod`) handle most changes; re-check every screen afterwards.

## Common AI-built mistakes

- Whole pages marked `"use client"` just to use one hook.
- Data fetched in `useEffect` on the client when it could load on the server, causing loading spinners and layout jumps.
- API routes in `app/api` with no authentication, called from client components.
- `NEXT_PUBLIC_` on a secret key "to make it work".
- Both `app/` and `pages/` versions of the same screen.
- `<img>` instead of `next/image` for large photos, or `next/image` with huge unoptimised sources and no `sizes`.
- `export const dynamic = 'force-dynamic'` added everywhere to silence an error, which removes all caching.

---

Sources:
- [Next.js documentation](https://nextjs.org/docs): App Router, metadata, images, fonts and error handling.
- [Next.js 16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16).
- [Next.js 15 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-15).
- [CVE-2025-29927 advisory](https://nextjs.org/blog/cve-2025-29927).
- [vibecoded-site-audit-skill](https://github.com/sstanley-yelnatss/vibecoded-site-audit-skill) (MIT).
- [code-review-skill](https://github.com/awesome-skills/code-review-skill) (MIT, idea): per-framework guides loaded on demand.
