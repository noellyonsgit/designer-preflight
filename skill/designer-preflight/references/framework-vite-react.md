# Vite + React (single-page apps)

A Vite React app is usually a **single-page app**: one `index.html`, with React drawing every screen in the browser. Lovable, Bolt and many v0 exports produce this shape, often with React Router, Tailwind and shadcn/ui, and Supabase as the backend.

## Conventions to follow

- **Everything is public.** All code ships to the browser. Variables starting `VITE_` are built into the JavaScript, so anyone can read them. Secrets (Stripe secret keys, OpenAI keys, Supabase service-role keys) must live in a server or edge function, never in a `VITE_` variable.
- **Routing:**
  - Refreshing or sharing a deep link (for example `/pricing`) returns a 404 unless the host rewrites all paths to `index.html`. Check for `vercel.json` rewrites, `netlify.toml` or `_redirects` (`/* /index.html 200`), or the host's SPA setting.
  - Make sure real files such as `/sitemap.xml` and `/robots.txt` are not swallowed by the rewrite.
- **Page titles and sharing:**
  - Each route should set `document.title` (React 19 supports `<title>` in components, or use a head manager).
  - Share previews (Open Graph) come from the static `index.html` only, because crawlers don't run the app. Put sensible defaults there.
- **Focus on navigation:** after a route change, move focus to the new page's `h1` or main region, so screen reader users know the page changed.
- **Code splitting:** use `React.lazy` with `Suspense` for heavy routes (editors, charts, maps), so the first screen loads quickly on phones.
- **Data states:**
  - Every fetch has loading, empty and error states.
  - TanStack Query (`isPending`, `isError`) makes this explicit; plain `useEffect` fetches often skip errors.
  - Add an error boundary around the app.
- **Linting:** ESLint with `eslint-plugin-react-hooks` catches broken hook usage, which AI edits often introduce. Keep its warnings meaningful rather than disabled.
- **Production preview:** `vite preview` is for checking the build locally, not for hosting.

## Common AI-built mistakes

- API keys in `VITE_` variables, or hard-coded into components.
- Admin screens "protected" only by hiding the link, or by a client-side role check, with the database left open (see `framework-supabase.md`).
- No 404 route (`path="*"`), so unknown URLs show a blank page.
- Several UI kits mixed (for example shadcn plus MUI plus custom), and several icon libraries.
- `index.html` still titled "Vite + React", with the Vite favicon.
- Dev server started with `--host` on public networks. Old Vite versions had dev-server file-read vulnerabilities; keep Vite patched.

---

Sources:
- [Vite documentation: env variables and modes](https://vite.dev/guide/env-and-mode).
- [Vite static deploy guide](https://vite.dev/guide/static-deploy).
- [React documentation](https://react.dev).
- [TanStack Query](https://tanstack.com/query).
- [vibecoded-site-audit-skill](https://github.com/sstanley-yelnatss/vibecoded-site-audit-skill) (MIT).
