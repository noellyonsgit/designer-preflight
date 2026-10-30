import fs from 'node:fs'
import path from 'node:path'
import { excerpt, lineOf } from '../files.mjs'

export const name = 'markup'
export const phases = ['standards', 'devices', 'performance']

const UI = /\.(html?|[jt]sx|vue|svelte|astro)$/i
const STYLE = /\.(css|scss|sass|less|[jt]sx|vue|svelte|astro|html?)$/i

function f(partial) {
  return { severity: 'P2', confidence: 'verified', effort: '30 min', source: ['preflight'], ...partial }
}

/** Group many hits into one finding per rule, naming the first few places. */
function grouped(hits, partial) {
  if (!hits.length) return []
  const files = [...new Set(hits.map((h) => h.file))]
  return [
    f({
      file: hits[0].file,
      line: hits[0].line,
      evidence: hits.slice(0, 6).map((h) => `${h.file}:${h.line}  ${excerpt(h.text, h.index, 90)}`).join('\n'),
      ...partial,
      what: partial.what
        .replace('{n}', hits.length)
        .replace('{files}', files.length)
        .replace(/\{([^{}|]*)\|([^{}|]*)\}/g, (_, one, many) => (hits.length === 1 ? one : many)),
    }),
  ]
}

const FIELD_SELECTOR = /(?:^|[\s,>+~])(?:input|select|textarea)\b|\.[\w-]*-(?:input|select|textarea)\b/
const SMALL_TEXT = /font-size\s*:\s*(?:(?:1[0-5]|[0-9])px|0?\.\d+rem)/

/** Font size on a real field rule. Matching "select" inside user-select or --input-border pointed at the wrong lines. */
function smallFieldRules(project) {
  const hits = []
  for (const file of project.matching(/\.(css|scss|sass|less)$/)) {
    const text = project.text(file) || ''
    for (const rule of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!FIELD_SELECTOR.test(rule[1]) || !SMALL_TEXT.test(rule[2])) continue
      const size = rule[2].match(SMALL_TEXT)
      const index = rule.index + rule[1].length + 1 + size.index
      hits.push({ file, line: lineOf(text, index), text, index, match: size[0] })
    }
  }
  return hits
}

function documentFiles(project, stack) {
  const candidates = ['index.html', 'public/index.html', 'src/index.html', 'app/layout.tsx', 'app/layout.jsx', 'app/layout.js', 'src/app/layout.tsx', 'src/app/layout.jsx', 'pages/_document.tsx', 'pages/_document.jsx', 'src/pages/_document.tsx', 'src/app.html', 'nuxt.config.ts', 'app.vue', 'src/layouts/Layout.astro', 'src/layouts/BaseLayout.astro']
  const found = candidates.filter((c) => project.exists(c))
  if (stack.framework.id === 'static') found.push(...project.matching(/(^|\/)[^/]+\.html?$/).filter((p) => !found.includes(p)).slice(0, 20))
  return found
}

export async function run(ctx) {
  const { project, stack, root } = ctx
  const findings = []
  const docs = documentFiles(project, stack)
  const docText = docs.map((d) => project.text(d) || '').join('\n')
  const isNext = stack.framework.id === 'next'

  if (docs.length) {
    const hasLang = (text) => /<html[^>]*\slang=/i.test(text) || /lang=\{/.test(text) || /htmlAttrs[\s\S]{0,80}lang/.test(text)
    const noLang = stack.framework.id === 'static' ? docs.filter((d) => /<html/i.test(project.text(d) || '') && !hasLang(project.text(d))) : hasLang(docText) ? [] : docs.slice(0, 1)
    if (noLang.length) {
      findings.push(f({ id: 'markup.no-lang', phase: 'standards', severity: 'P1', file: noLang[0], evidence: noLang.slice(0, 6).join('\n'), what: 'The page does not declare its language (the lang attribute on <html>).', why: 'Screen readers use it to pick the right voice and pronunciation; without it, English text may be read in another accent or language. Translation tools and search engines use it too.', fix: 'Add lang="en" (or your language) to the <html> tag.', effort: '5 min', source: ['WCAG 2.2 SC 3.1.1'] }))
    }
    const hasViewport = /name=["']viewport["']/i.test(docText) || isNext || ['nuxt', 'sveltekit', 'astro'].includes(stack.framework.id) && /viewport/i.test(docText)
    if (!hasViewport && !isNext) {
      findings.push(f({ id: 'markup.no-viewport', phase: 'devices', severity: 'P0', file: docs[0], what: 'There is no viewport meta tag.', why: 'Without it, phones show the desktop layout zoomed out to a tiny size, so the site is unusable on mobile.', fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to the <head>.', effort: '5 min' }))
    }
    const zoomBlock = /(user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b|userScalable\s*:\s*false|maximumScale\s*:\s*1\b)/i.exec(docText)
    if (zoomBlock) {
      findings.push(f({ id: 'markup.zoom-blocked', phase: 'standards', severity: 'P1', file: docs[0], what: 'The viewport setting stops people from zooming in.', why: 'People with low vision rely on pinch-to-zoom. Blocking it fails WCAG and is often added only to hide the iPhone input-zoom problem, which has a better fix (16px inputs).', fix: 'Remove user-scalable=no and maximum-scale=1 from the viewport setting.', effort: '5 min', evidence: zoomBlock[0], source: ['WCAG 2.2 SC 1.4.4'] }))
    }
    const defaultTitle = /<title>\s*(Vite \+ React(?: \+ TS)?|Vite App|React App|Create Next App|Astro|SvelteKit app|Nuxt)\s*<\/title>|title:\s*['"](Create Next App|Vite App)['"]/i.exec(docText)
    if (defaultTitle) {
      findings.push(f({ id: 'markup.default-title', phase: 'performance', severity: 'P1', file: docs[0], what: `The page title is still the framework default ("${(defaultTitle[1] || defaultTitle[2]).trim()}").`, why: 'The title is what people see in browser tabs, bookmarks, search results and link previews. A default title looks unfinished and hurts search ranking.', fix: 'Set a real title for each page (and a default for the site).', effort: '5 min', source: ['vibecoded-site-audit-skill (MIT)'] }))
    }
    const allUi = project.matching(UI).map((p) => project.text(p) || '').join('\n')
    if (!/name=["']description["']|description\s*:\s*['"`]|<meta\s+name="description"/i.test(docText + allUi)) {
      findings.push(f({ id: 'markup.no-description', phase: 'performance', file: docs[0], what: 'No meta description is set.', why: 'Search engines and link previews show this text under your title. Without it they pick random text from the page.', fix: isNext ? 'Add description to the metadata export in your root layout and key pages.' : 'Add <meta name="description" content="…"> to the <head>.', effort: '5 min', source: ['Front-End-Checklist (MIT)'] }))
    }
    if (!/og:image|openGraph[\s\S]{0,400}images|opengraph-image\./i.test(docText + allUi + project.list.join('\n'))) {
      findings.push(f({ id: 'markup.no-og-image', phase: 'performance', file: docs[0], what: 'No social preview image (Open Graph image) is set.', why: 'When someone shares your link in Slack, iMessage, LinkedIn or WhatsApp, it appears as a plain link instead of a card with an image.', fix: isNext ? 'Add an opengraph-image.png (1200x630) next to your root layout, or set openGraph.images in metadata.' : 'Add <meta property="og:image" content="https://…/preview.png"> (1200x630) plus og:title and og:description.', effort: '30 min', source: ['vibecoded-site-audit-skill (MIT)'] }))
    }
    if (/viewport-fit\s*=\s*cover|viewportFit\s*:\s*['"]cover/.test(docText) && !project.grep(STYLE, /safe-area-inset/, { limit: 1 }).length) {
      findings.push(f({ id: 'markup.safe-area-missing', phase: 'devices', file: docs[0], what: 'The page extends under the iPhone notch and home bar (viewport-fit=cover) but never uses the safe-area insets.', why: 'Headers, buttons and bottom bars can sit under the notch or the home indicator, where they are hidden or hard to tap.', fix: 'Add padding using env(safe-area-inset-top) and env(safe-area-inset-bottom) to fixed headers and bottom bars.', effort: '30 min', source: ['safari-webkit-skill (MIT)'] }))
    }
  }

  const fixedBottom = project.grep(STYLE, /position\s*:\s*fixed[^}]{0,200}bottom\s*:\s*0|\bfixed\b[^"'`\n]{0,80}\bbottom-0\b/, { limit: 3 })
  if (fixedBottom.length && !project.grep(STYLE, /safe-area-inset-bottom|pb-safe|env\(safe-area/, { limit: 1 }).length) {
    findings.push(...grouped(fixedBottom, { id: 'markup.fixed-bottom-safe-area', phase: 'devices', what: 'Bars fixed to the bottom of the screen do not allow for the iPhone home indicator ({n} place(s)).', why: 'On iPhones without a home button, the bottom of the screen belongs to the system swipe gesture, so buttons there are hard to tap or partly hidden.', fix: 'Add padding-bottom: env(safe-area-inset-bottom) to bottom bars, and include viewport-fit=cover in the viewport meta.', source: ['safari-webkit-skill (MIT)'] }))
  }

  const vh = project.grep(STYLE, /(?<!min-|max-)height\s*:\s*['"]?100vh|(?<![\w-])h-screen\b|(?<![\w-])h-\[100vh\]/, { limit: 50 })
  if (vh.length && !project.grep(STYLE, /\b\d+[dsl]vh\b|h-dvh|h-svh|min-h-dvh|min-h-svh/, { limit: 1 }).length) {
    findings.push(...grouped(vh, { id: 'markup.100vh', phase: 'devices', what: 'Full-height sections use 100vh ({n} place(s)).', why: 'On phones, 100vh is taller than the visible screen because it ignores the browser\'s address bar. Bottom content and buttons get cut off, and layouts jump as the bar shows and hides (Safari on iPhone and Chrome on Android).', fix: 'Use 100dvh (or 100svh for things that must always fit), or Tailwind h-dvh / min-h-svh.', source: ['web-features: viewport-unit-variants'] }))
  }

  const smallInputs = [...smallFieldRules(project)]
  for (const hit of project.grep(/\.(jsx|tsx|vue|svelte|astro|html?)$/, /<(input|select|textarea)\b[^>]*\b(text-xs|text-sm|text-\[1[0-5]px\])/, { limit: 10 })) smallInputs.push(hit)
  findings.push(...grouped(smallInputs, { id: 'markup.input-zoom', phase: 'devices', what: 'Form fields use text smaller than 16px ({n} place(s)).', why: 'Safari on iPhone zooms the whole page in when someone taps a field with text under 16px, and does not zoom back out. The layout looks broken mid-form.', fix: 'Use at least 16px (text-base) for inputs, selects and text areas on small screens. Do not block zoom to hide this.', effort: '5 min', source: ['safari-webkit-skill (MIT)'] }))

  const dateParse = project.grep(/\.(m?[jt]sx?|vue|svelte)$/, /new Date\(\s*['"`]\d{4}-\d{2}-\d{2}[ T]?\d{0,2}:?\d{0,2}[^'"`]*['"`]\s*\)|new Date\(\s*['"`]\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/, { limit: 10 })
  findings.push(...grouped(dateParse.filter((h) => / \d{1,2}:|\d{1,2}[/-]\d{1,2}[/-]/.test(h.match)), { id: 'markup.date-parsing', phase: 'devices', severity: 'P1', what: 'Dates are created from text in a format Safari cannot read ({n} place(s)).', why: 'Formats like "2025-01-15 10:00" or "01/15/2025" work in Chrome but give "Invalid Date" in Safari, so dates, countdowns or bookings break for every iPhone user.', fix: 'Use ISO format with a T ("2025-01-15T10:00:00") or build dates from numbers, or use a date library to parse.', effort: '30 min', source: ['safari-webkit-skill (MIT)'] }))

  const videos = project.grep(UI, /<video\b[^>]*\bautoplay\b[^>]*>/i, { limit: 10 }).filter((h) => !/muted/i.test(h.match) || !/playsinline|playsInline/.test(h.match))
  findings.push(...grouped(videos, { id: 'markup.video-autoplay', phase: 'devices', what: 'Autoplaying videos are missing muted or playsinline ({n} place(s)).', why: 'Safari on iPhone only autoplays a video if it is muted and plays inline. Otherwise it shows a still frame, or jumps to full screen. Low Power Mode can still block it, so the first frame should work as a poster.', fix: 'Add muted and playsInline (playsinline in HTML) plus a poster image.', effort: '5 min', source: ['safari-webkit-skill (MIT)'] }))

  const clickDivs = project.grep(/\.(jsx|tsx|vue|svelte|astro|html?)$/, /<(div|span|li|img|p)\b(?=[^>]*\b(onClick|onclick|@click|on:click)\b)(?![^>]*\b(role|tabIndex|tabindex)=)[^>]*>/, { limit: 100 })
  const buttons = project.grep(/\.(jsx|tsx|vue|svelte|astro|html?)$/, /<button\b|<Button\b/, { limit: 2000 }).length
  findings.push(...grouped(clickDivs, { id: 'markup.clickable-div', phase: 'standards', severity: 'P1', what: '{n} clickable {element is|elements are} not a real button or link (in {files} file(s)).', why: `Keyboard users cannot reach or activate them, and screen readers do not announce them as clickable. ${buttons ? `The project has ${buttons} real buttons, so the pattern is mixed.` : ''}`.trim(), fix: 'Use <button> for actions and <a href> for navigation. Restyle them as needed; they can look like anything.', source: ['vibe-building-skills accessibility-excellence (MIT)', 'WCAG 2.2 SC 2.1.1'] }))

  const imgNoAlt = project.grep(/\.(jsx|tsx|vue|svelte|astro|html?)$/, /<(img|Image)\b(?![^>]*\balt=)[^>]*\/?>/, { limit: 100 })
  findings.push(...grouped(imgNoAlt, { id: 'markup.img-no-alt', phase: 'standards', severity: 'P1', what: '{n} {image has|images have} no alt text (in {files} file(s)).', why: 'Screen readers read out the file name instead, or skip the image, and the image\'s meaning is lost. Search engines also use alt text.', fix: 'Describe what the image shows or does (alt="Red trainers, side view"). Use alt="" only for purely decorative images.', effort: '30 min', source: ['WCAG 2.2 SC 1.1.1'] }))

  const outline = project.grep(STYLE, /outline\s*:\s*(none|0)\b|\boutline-none\b|focus:outline-none/, { limit: 50 })
  if (outline.length && !project.grep(STYLE, /focus-visible|focus:ring|focus-visible:ring|:focus\s*\{[^}]*(box-shadow|outline\s*:\s*\d)/, { limit: 1 }).length) {
    findings.push(...grouped(outline, { id: 'markup.focus-removed', phase: 'standards', severity: 'P1', what: 'The keyboard focus outline is removed ({n} place(s)) with no replacement style.', why: 'People using a keyboard (and many power users) cannot see where they are on the page, so they cannot use it.', fix: 'Keep an outline or add a clear :focus-visible style (for example a 2px ring in your brand colour with enough contrast).', effort: '30 min', source: ['WCAG 2.2 SC 2.4.7'] }))
  }
  const positiveTab = project.grep(/\.(jsx|tsx|vue|svelte|astro|html?)$/, /tab[iI]ndex=\{?["']?[1-9]/, { limit: 20 })
  findings.push(...grouped(positiveTab, { id: 'markup.positive-tabindex', phase: 'standards', severity: 'P1', what: 'tabIndex values above 0 are used ({n} place(s)).', why: 'They force a custom keyboard order that almost never matches the visual order, so keyboard users jump around the page unpredictably.', fix: 'Remove positive tabIndex values and put elements in the right order in the markup instead.', effort: '5 min', source: ['WCAG 2.2 SC 2.4.3'] }))

  const animated = project.grep(STYLE, /@keyframes|framer-motion|from ['"]motion|animate-|transition\s*:/, { limit: 1 }).length
  if (animated && !project.grep(STYLE, /prefers-reduced-motion|motion-reduce|motion-safe|useReducedMotion|MotionConfig/, { limit: 1 }).length) {
    findings.push(f({ id: 'markup.reduced-motion', phase: 'standards', confidence: 'needs-human', what: 'The site animates, but never checks the "reduce motion" setting.', why: 'Some people get dizzy or nauseous from motion and turn on "Reduce motion" on their phone or computer. The site ignores that request.', fix: 'Wrap large or looping animations in @media (prefers-reduced-motion: no-preference), use Tailwind motion-safe:, or use MotionConfig reducedMotion="user" with Framer Motion.', source: ['WCAG 2.2 SC 2.3.3'] }))
  }

  const hover = project.grep(STYLE, /:hover\b|\bhover:/, { limit: 1 }).length
  if (hover && !project.grep(STYLE, /@media\s*\(\s*hover\s*:\s*hover|any-hover|hoverOnlyWhenSupported/, { limit: 1 }).length) {
    findings.push(f({ id: 'markup.sticky-hover', phase: 'devices', confidence: 'needs-human', what: 'Hover styles are not limited to devices that can hover.', why: 'On phones, a tap triggers the hover style and it can stay "stuck" until the person taps elsewhere, so buttons and cards look wrong after use. (Tailwind v4 already limits hover: to hover-capable devices.)', fix: stack.tailwind?.major >= 4 ? 'Check custom CSS :hover rules; wrap them in @media (hover: hover).' : 'Wrap :hover rules in @media (hover: hover), or set future.hoverOnlyWhenSupported in Tailwind v3.', source: ['safari-webkit-skill (MIT)'] }))
  }

  const isSite = !['node'].includes(stack.framework.id)
  if (isSite) {
    const robots = ['public/robots.txt', 'static/robots.txt', 'robots.txt', 'app/robots.ts', 'app/robots.js', 'src/app/robots.ts'].some((p) => fs.existsSync(path.join(root, p)))
    const sitemap = ['public/sitemap.xml', 'static/sitemap.xml', 'sitemap.xml', 'app/sitemap.ts', 'app/sitemap.js', 'src/app/sitemap.ts'].some((p) => fs.existsSync(path.join(root, p))) || Boolean(stack.deps['next-sitemap'] || stack.deps['@astrojs/sitemap'])
    if (!robots || !sitemap) {
      findings.push(f({ id: 'markup.robots-sitemap', phase: 'performance', confidence: 'needs-human', what: `${[!robots && 'robots.txt', !sitemap && 'a sitemap'].filter(Boolean).join(' and ')} ${!robots && !sitemap ? 'are' : 'is'} missing.`, why: 'Search engines use these to find and index your pages. Without a sitemap, pages that are not linked from the home page may never appear in search.', fix: isNext ? 'Add app/robots.ts and app/sitemap.ts (Next.js generates the files).' : 'Add robots.txt and sitemap.xml to the public folder. If the site uses a catch-all rewrite, check that /sitemap.xml returns XML, not your app\'s HTML.', effort: '30 min', source: ['vibecoded-site-audit-skill (MIT)'] }))
    }
    const favicon = project.list.some((p) => /(^|\/)(favicon\.(ico|svg|png)|icon\.(png|svg|ico|[jt]sx?)|apple-icon\.(png|[jt]sx?)|apple-touch-icon\.png)$/.test(p))
    const defaultIcon = /href=["']\/(vite|next)\.svg["']|rel=["']icon["'][^>]*vite\.svg/.test(docText)
    if (!favicon || defaultIcon) {
      findings.push(f({ id: 'markup.favicon', phase: 'performance', file: docs[0] || 'package.json', what: defaultIcon ? 'The browser-tab icon is still the framework logo.' : 'There is no favicon.', why: 'The icon appears in tabs, bookmarks, phone home screens and search results; a missing or default one looks unfinished.', fix: 'Add favicon.ico, an SVG icon and a 180x180 apple-touch-icon.png, and reference them in the <head>.', effort: '30 min', source: ['vibecoded-site-audit-skill (MIT)'] }))
    }
  }
  return findings
}
