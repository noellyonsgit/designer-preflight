# Accessibility: the manual pass

axe-core runs on every screen automatically, but automated tools catch only part of real problems (estimates range from about a third to about half). They cannot tell whether the keyboard order makes sense, whether focus is visible enough, or whether a label is useful. An automatic pass is not proof the site is accessible: say so to the designer.

The target is **WCAG 2.2 level AA**. For shops and services sold in the EU, the European Accessibility Act has applied since June 2025, so accessibility can be a legal requirement, not just good practice.

Prefer native HTML elements (`<button>`, `<a href>`, `<label>`, `<dialog>`, `<details>`) over ARIA. Add ARIA only when no native element fits.

## Keyboard walk-through (read the code, and describe it to the designer)

For the main journey, check that someone using only Tab, Shift+Tab, Enter, Space, the arrow keys and Esc can:
- reach every link, button and field, in an order that matches the visual order;
- **see where they are** at all times (a visible focus style with at least 3:1 contrast, not hidden behind sticky headers: WCAG 2.4.11);
- skip the navigation (a "Skip to content" link on sites with long headers);
- open and close menus, drop-downs, accordions, tabs and carousels;
- use modals. Focus moves into the modal, stays inside while it is open, Esc closes it, and focus returns to the button that opened it. The page behind is `inert`.
- complete forms, with errors announced and focus moved to the first error.

Things that usually fail in AI-built UIs:
- clickable `div`s and cards;
- icon-only buttons with no name;
- custom selects and date pickers;
- hover-only menus;
- toasts that disappear before they can be read.

## Forms

- Every field has a visible label. A placeholder is not a label, because it disappears on typing.
- Required fields are marked in text, not only with colour or an asterisk.
- Errors say what went wrong and how to fix it. They are linked to the field (`aria-describedby`) and announced (`aria-live="polite"` or moving focus).
- Use the right `type` and `autocomplete` (`email`, `tel`, `name`, `street-address`, `one-time-code`). Phones then show the right keyboard and can autofill. This also covers WCAG 3.3.7 (no re-entering the same information).
- Sign-in does not rely on memory puzzles. Allow pasting passwords and use password managers (WCAG 3.3.8).

## Seeing and reading

- Text contrast is at least 4.5:1, or 3:1 for large text and for icons and UI borders. Check the design tokens, so fixing one colour fixes it everywhere.
- Colour is never the only signal (for example, error fields also have an icon or text).
- Pages work at 200% zoom and at 320px wide without sideways scrolling (WCAG 1.4.10 Reflow).
- Text still fits when spacing is increased: no fixed-height boxes around text.
- Alt text describes what an image is for, not "image of". Decorative images use `alt=""`. Whether alt text is *good* is a human judgement: mark it `human-only`.
- Video has captions; audio has a transcript.

## Motion and timing

- Respect "Reduce motion" (`prefers-reduced-motion`): turn off parallax, large movement and auto-playing carousels.
- Anything that moves for more than 5 seconds can be paused.
- Nothing flashes more than three times a second.
- Time limits, such as sessions or offers, can be extended.

## Touch and pointer (WCAG 2.2)

- Tap targets are at least 24x24px (2.5.8). 44x44px is better on phones.
- Anything done by dragging (sliders, reordering, maps) also has a click or tap alternative (2.5.7).
- Help links or contact details are in the same place on every page (3.2.6).

## Structure

- One `h1` per page, then headings in order. Choose levels by structure, not size.
- Landmarks: `header`, `nav`, `main` and `footer`.
- A unique, descriptive `<title>` on every page. In single-page apps, update the title on navigation and move focus to the new page's heading.
- `lang` is set on `<html>`.
- Link text makes sense on its own: not "click here" or "read more" repeated.

## Ten-minute screen reader check (for the designer)

Suggest the designer tries this themselves:
- **iPhone:** Settings, then Accessibility, then VoiceOver. Swipe right to move, double-tap to activate.
- **Mac:** Cmd+F5 turns VoiceOver on.
- **Android:** Settings, then Accessibility, then TalkBack.

Ask them to listen to the home page and the main journey: is every button announced with a sensible name?

---

Sources:
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) (W3C).
- [axe-core](https://github.com/dequelabs/axe-core) by Deque (MPL-2.0).
- [accessibility-excellence](https://github.com/sanky369/vibe-building-skills/blob/main/skills/frontend-design/accessibility-excellence/SKILL.md) by sanky369 (MIT): semantic HTML first, plus stating what was not verified.
- [Asymmetric-al accessibility-review](https://github.com/Asymmetric-al/core/blob/develop/.cursor/skills/accessibility-review/SKILL.md) (AGPL-3.0, idea only): keep a manual pass alongside axe.
- [AccessLint skills](https://github.com/AccessLint/skills) (no licence, idea only): grading findings by evidence.
- [The A11Y Project checklist](https://www.a11yproject.com/checklist/).
- [European Accessibility Act](https://commission.europa.eu/strategy-and-policy/policies/justice-and-fundamental-rights/disability/union-equality-strategy-rights-persons-disabilities-2021-2030/european-accessibility-act_en).
