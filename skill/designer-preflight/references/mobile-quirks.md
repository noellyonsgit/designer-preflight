# Phones and browsers: known problems

Every browser on an iPhone (Safari, Chrome, Firefox, in-app browsers) uses Apple's WebKit engine, so "it works in Chrome on my Mac" says little about iPhones. The scan emulates phone sizes in Chrome, which catches layout problems but **not** WebKit-specific bugs. Use this list against the code, and give the designer the real-phone script from the report.

Each item says what visitors experience, how to spot it, and the fix. Items marked *(scanned)* are also checked automatically.

## Layout and viewport

| What visitors see | Look for | Fix |
| --- | --- | --- |
| Bottom of full-screen sections cut off; layout jumps as the address bar hides *(scanned)* | `100vh`, `h-screen` | `100dvh` (changes with the bar) or `100svh` (always fits); Tailwind `h-dvh` / `h-svh` |
| Buttons hidden behind the notch or home indicator *(scanned)* | `position: fixed` with `bottom: 0` and no safe-area padding | `padding-bottom: env(safe-area-inset-bottom)` plus `viewport-fit=cover` in the viewport meta |
| Page wobbles sideways *(scanned)* | Fixed widths, `100vw` (includes the scrollbar), long words or URLs, wide tables | `max-width: 100%`, `overflow-wrap: anywhere`, scrollable table wrappers |
| Text suddenly larger after rotating to landscape | No text-size-adjust | `html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }` |
| Sticky header does not stick | An ancestor with `overflow: hidden` or `overflow: auto` | Remove the overflow from ancestors, or use `overflow: clip` |

## Forms and the on-screen keyboard

| What visitors see | Look for | Fix |
| --- | --- | --- |
| Page zooms in when tapping a field and stays zoomed *(scanned)* | Input text under 16px | 16px or larger on phones. Never fix this by blocking zoom. |
| Keyboard covers the field or the submit button (iPhone) | Bottom-fixed forms, chat inputs, modals with fields at the bottom | Let the page scroll; avoid fixed bottom inputs, or reposition with the `visualViewport` API |
| On Android, layout squashes when the keyboard opens | Full-height layouts with fixed footers | Chrome on Android resizes the page for the keyboard; test it, and consider `interactive-widget=resizes-content` or `overlays-content` in the viewport meta |
| Wrong keyboard (letters for a phone number) | Missing `type` or `inputmode` | `type="email"`, `type="tel"`, `inputmode="numeric"`, plus `autocomplete` values |
| iPhone photo uploads fail or show broken images | `<input type="file" accept="image/*">` sending HEIC files the server or `<img>` can't handle | Convert HEIC on the server, or ask for JPEG/PNG with a clear message |

## Touch and interaction

| What visitors see | Look for | Fix |
| --- | --- | --- |
| Hover styles get "stuck" after tapping *(scanned)* | `:hover` styles outside `@media (hover: hover)` | Wrap hover styles in `@media (hover: hover)` (Tailwind v4 does this for `hover:` already) |
| Menu that only opens on hover cannot be opened | Hover-only dropdowns | Open on click or tap too |
| Page behind an open modal still scrolls (iPhone) | Scroll lock using only `body { overflow: hidden }` | Lock both `html` and `body`, or use a tested scroll-lock utility; check on a real iPhone |
| Grey flash when tapping | Default tap highlight | `-webkit-tap-highlight-color: transparent`, plus a visible pressed state |
| Android back button leaves the site instead of closing a modal or menu | Overlays that don't add history entries | Close overlays on `popstate`, or push a history entry when opening a full-screen overlay |
| Copy-to-clipboard silently fails | `navigator.clipboard` called outside a tap handler, or after an `await` | Call it directly in the tap handler, and show a fallback |

## Media

| What visitors see | Look for | Fix |
| --- | --- | --- |
| Background video shows a still frame, or opens full screen *(scanned)* | `autoplay` without `muted` and `playsinline` | Add `muted`, `playsinline` (`playsInline` in JSX) and a `poster`. Low Power Mode can still block autoplay, so the poster must work alone. |
| Frosted-glass effect missing on older iPhones *(scanned)* | `backdrop-filter` without `-webkit-backdrop-filter` (needed before Safari 18) | Add the prefixed property, or rely on Autoprefixer, Lightning CSS or Tailwind |
| Dates show "Invalid Date" or NaN on iPhones *(scanned)* | `new Date('2025-01-15 10:00')`, `new Date('01/15/2025')` | ISO format with `T` (`2025-01-15T10:00:00`), or a date library |
| Fonts flash or text is invisible while loading | Web fonts without `font-display` | `font-display: swap`, or the framework's font tool (`next/font`, `@fontsource`) |

## Storage, sign-in and in-app browsers

| What visitors see | Look for | Fix |
| --- | --- | --- |
| Visitors on Safari are "forgotten" after a week | Important state kept only in `localStorage` (Safari's tracking prevention can clear script-written storage after 7 days without a visit) | Keep sessions in server-set cookies; treat `localStorage` as a cache |
| Sign-in fails inside embedded content | Third-party cookies inside iframes (blocked in Safari, and increasingly in other browsers) | Sign in on your own domain, not inside a cross-site iframe |
| "Sign in with Google" fails when the link is opened from Instagram, TikTok, Facebook or LinkedIn | In-app browsers (Google blocks sign-in in embedded web views); downloads and payment pop-ups can also fail | Detect in-app browsers and show "Open in Safari/Chrome", or offer email sign-in. Test by sharing the link in Instagram. |
| Home-screen icon is a blurry screenshot | No `apple-touch-icon` | A 180x180 PNG `apple-touch-icon`, plus a web manifest for Android |

## Newer CSS and JavaScript

The scan checks newer features against the project's `browserslist` targets, or Baseline "widely available" if none are set, using web-features data. For each feature it flags, ask: does the design still work without it? If yes, it is a safe enhancement. If no, add a fallback inside `@supports`, or avoid the feature. Common examples: `:has()`, container queries, `@starting-style`, view transitions, popover, anchor positioning, `text-wrap: balance`/`pretty`, scroll-driven animations, `field-sizing`.

Tailwind CSS v4 needs Safari 16.4+, Chrome 111+ and Firefox 128+. If the designer must support older iPhones, Tailwind v3.4 is the safer choice.

## Android-specific notes

- Samsung Internet (common in Europe and Asia) has its own dark mode that can recolour sites. Check pages with dark mode on if the brand colours matter.
- Older and cheaper Android phones are much slower than the test laptop. Heavy JavaScript, animations and large images hurt most there.

---

Sources:
- [safari-webkit-skill](https://github.com/K8Cill/safari-webkit-skill) by K8Cill (MIT): date parsing, input zoom, autoplay, `-webkit-backdrop-filter` and keyboard shifts.
- [ios-safari-quirks](https://github.com/ssv445/claude-skills/blob/main/ios-safari-quirks/SKILL.md) by ssv445 (no licence, idea only): tracking-prevention storage limits and user-activation rules.
- [can-i-use skill](https://github.com/ivklgn/ai-kit/blob/main/skills/can-i-use/SKILL.md) by ivklgn (MIT): checking against real targets, then Baseline.
- [web-features](https://github.com/web-platform-dx/web-features) (Apache-2.0) and [MDN browser-compat-data](https://github.com/mdn/browser-compat-data) (CC0).
- [WebKit blog: tracking prevention](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/).
- [Google: embedded web view sign-in policy](https://developers.googleblog.com/2021/06/upcoming-security-changes-to-googles-oauth-2.0-authorization-endpoint.html).
- [Tailwind CSS browser support](https://tailwindcss.com/docs/compatibility).
- [MDN: viewport meta and interactive-widget](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/viewport).
