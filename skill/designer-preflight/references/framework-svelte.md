# Svelte and SvelteKit

SvelteKit is the standard way to build Svelte apps: file-based routes in `src/routes`, with server code in `+page.server.ts`, `+layout.server.ts` and `+server.ts`. A plain Vite + Svelte app is a single-page app (read `framework-vite-react.md` for routing and public variables).

## Conventions to follow

- **Svelte 5 runes** (`$state`, `$derived`, `$props`, `$effect`) replace `let` reactivity, `$:` statements and `export let`. A mix of both styles in one project usually means some components were written by an older AI pass. Migrating is optional, but don't mix styles inside one component.
- **Secrets:**
  - `$env/static/private` and `$env/dynamic/private` are server-only; SvelteKit refuses to import them into browser code.
  - Variables starting `PUBLIC_` reach the browser.
- **Server code:**
  - `load` functions in `+page.server.ts` and form actions run on the server, and form actions can be called by anyone. Check the user (for example `locals.user` set in `hooks.server.ts`) inside each action and server load that returns private data.
  - `+server.ts` endpoints are APIs: authenticate and authorise each method.
- **`{@html …}`** is a script-injection risk with user, CMS or AI content. Sanitise it, or render text.
- **Pages:**
  - Use `<svelte:head>` for titles, descriptions and share images.
  - Add `+error.svelte` for designed error pages.
- **Forms:** use progressive enhancement (`use:enhance`), so forms work before JavaScript loads. That helps slow phones.
- **Linting:** `eslint-plugin-svelte`. `svelte-check` checks types and accessibility warnings; don't silence its a11y warnings.

## Common AI-built mistakes

- Private data returned from a universal `+page.ts` load (it runs in the browser too) instead of `+page.server.ts`.
- Svelte's accessibility warnings disabled wholesale (`svelte-ignore a11y_*`).
- Clickable `<div on:click>` / `onclick` instead of `<button>`.

---

Sources:
- [Svelte documentation](https://svelte.dev/docs/svelte), including runes and the Svelte 5 migration guide.
- [SvelteKit documentation](https://svelte.dev/docs/kit): routing, form actions, `$env` modules and hooks.
- [eslint-plugin-svelte](https://sveltejs.github.io/eslint-plugin-svelte/).
