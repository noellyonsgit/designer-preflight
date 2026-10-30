# Astro

Astro builds mostly-static pages from `.astro` components in `src/pages`, and adds interactive "islands" (React, Vue, Svelte and others) only where needed. It is a common choice for portfolios, marketing sites and blogs.

## Conventions to follow

- **Ship less JavaScript.**
  - Components only run in the browser when they have a `client:*` directive.
  - Use `client:visible` or `client:idle` for anything below the fold.
  - `client:load` on everything defeats the point of Astro.
- **Rendering:**
  - Output is static by default.
  - Pages that need the server (forms, sign-in, personal data) need an adapter and `export const prerender = false`.
  - Endpoints in `src/pages/api` and Astro actions need authentication checks like any API.
- **Variables:** only `PUBLIC_` variables reach the browser. Use `astro:env` with a schema to make server-only secrets explicit.
- **`set:html`** is a script-injection risk with user, CMS or AI content. Sanitise it, or render text.
- **Images:** use `astro:assets` (`<Image />` and `<Picture />`) for automatic sizing and modern formats. Always give alt text.
- **Layouts:** use one base layout for `<html lang>`, the viewport meta, title, description, share image and favicon. Pages built without it often miss these.
- **Content:** content collections (`src/content`) with a schema keep blog and project data consistent.
- **Pages:** add `src/pages/404.astro` for a designed not-found page. `@astrojs/sitemap` generates a sitemap.

## Common AI-built mistakes

- Every component hydrated with `client:load`.
- Pages that bypass the base layout, and so miss `lang`, meta tags or fonts.
- A server adapter added for one form, which turns the whole site server-rendered without anyone noticing.

---

Sources:
- [Astro documentation](https://docs.astro.build): islands and client directives, on-demand rendering, `astro:env`, images and content collections.
- [@astrojs/sitemap](https://docs.astro.build/en/guides/integrations-guide/sitemap/).
