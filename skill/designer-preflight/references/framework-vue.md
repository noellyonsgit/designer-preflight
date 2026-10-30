# Vue and Nuxt

Vue apps built with Vite are single-page apps (read `framework-vite-react.md` for routing, titles and the public-variable rules, which apply in the same way with `VITE_`). Nuxt adds server rendering, file-based routing and server routes.

## Conventions to follow

- **Composition API with `<script setup>`** is the current standard. A mix of Options API and Composition API in one project is often a leftover from different generations.
- **`v-html` is a script-injection risk** with any content from users, a CMS or an AI model. Sanitise it (DOMPurify) or render text.
- **Nuxt configuration:**
  - `runtimeConfig` holds server-only secrets. Only `runtimeConfig.public` reaches the browser.
  - Variables use `NUXT_` and `NUXT_PUBLIC_` prefixes.
- **Nuxt server routes** (`server/api/**`) need the same authentication and authorisation checks as any API (see `security.md`).
- **Nuxt pages:**
  - Use `useHead` or `useSeoMeta` for titles, descriptions and share images.
  - Use `error.vue` for a designed error page.
  - Use `<NuxtLink>` for internal links.
- **Data:** `useFetch` and `useAsyncData` return `pending`/`status` and `error`. Check that templates show all three states.
- **State:** Pinia is the standard store. Vuex in a Vue 3 project is a leftover.
- **Linting:** `eslint-plugin-vue` (and `@nuxt/eslint` for Nuxt). `vue-tsc` checks types in `.vue` files.

## Common AI-built mistakes

- Secrets placed in `runtimeConfig.public` or `VITE_` variables.
- `v-for` without `:key`, or keyed by index on lists that reorder.
- Clickable `<div @click>` instead of `<button>`.
- Both Vuex and Pinia, or both Options and Composition styles for the same feature.

---

Sources:
- [Vue documentation](https://vuejs.org/guide/), including its [security guide](https://vuejs.org/guide/best-practices/security).
- [Nuxt runtime config](https://nuxt.com/docs/guide/going-further/runtime-config).
- [Nuxt SEO and meta](https://nuxt.com/docs/getting-started/seo-meta).
- [Pinia](https://pinia.vuejs.org).
