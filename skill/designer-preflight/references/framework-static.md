# Plain HTML, CSS and JavaScript

No framework and no build step: the files in the folder are the website. That makes it simple to host, but there is no tool catching mistakes, so the basics need checking by hand on every page.

## Conventions to follow

- **Every page needs its own head:**
  - `<!doctype html>` and `<html lang="en">`;
  - `<meta charset="utf-8">`;
  - `<meta name="viewport" content="width=device-width, initial-scale=1">`;
  - a unique `<title>`;
  - a meta description;
  - share tags (`og:title`, `og:description`, `og:image`);
  - a favicon and `apple-touch-icon`.

  Copy-pasted pages often miss or duplicate these: check every `.html` file.
- **Links:**
  - Relative links (`about.html`, `./images/x.jpg`) break when pages move into folders.
  - Check every link and image path.
  - Watch for file-name case: `Photo.JPG` works on a Mac but not on most web hosts.
- **Forms** need somewhere to send data: a form service (such as Formspree or Netlify Forms) or a serverless function. A form with no `action` or a `mailto:` action often just does nothing.
- **Scripts:**
  - Use `<script type="module">` or `defer`, so scripts don't block the page.
  - Avoid inline `onclick` handlers on non-buttons; use `<button>` and `addEventListener`.
- **CSS:**
  - One stylesheet (or a clear set) with custom properties for colours and spacing.
  - Several stylesheets that override each other are a common leftover.
- **Pages:** add a `404.html` (most hosts use it automatically), plus `robots.txt` and `sitemap.xml`.
- **Images:**
  - Export at no more than twice the displayed size.
  - Use WebP or AVIF.
  - Add `width`, `height`, `loading="lazy"` below the fold, and alt text.
- **Third-party embeds** (maps, video, fonts, analytics) each slow the page down and may need cookie consent.

## Common AI-built mistakes

- Pages copied and edited, so navigation, footer and meta tags drift apart between pages.
- `maximum-scale=1` or `user-scalable=no` in the viewport meta.
- Contact forms that never send anything.
- jQuery or other libraries loaded from a CDN for one small effect.

---

Sources:
- [MDN: HTML basics](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Structuring_content).
- [Front-End-Checklist](https://github.com/thedaviddias/Front-End-Checklist) by David Dias (MIT): head, SEO, image and performance items.
- [The Open Graph protocol](https://ogp.me).
