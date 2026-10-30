import axe from 'axe-core'
import { VIEWPORTS, discoverScreens, joinUrl, launchBrowser, setViewport, visit } from '../browser.mjs'
import { ensureServer } from '../server.mjs'

export const name = 'runtime'
export const phases = ['standards', 'devices', 'performance', 'states', 'security']

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']
const IGNORE_SELECTORS = ['nextjs-portal', 'vite-error-overlay', '#__next-build-watcher', '[data-nextjs-toast]', 'astro-dev-toolbar']
const AXE_SEVERITY = { critical: 'P1', serious: 'P1', moderate: 'P2', minor: 'P2' }

/** Plain-language versions of the axe rules designers hit most. Others fall back to axe's own help text. */
const AXE_PLAIN = {
  'color-contrast': ['Some text does not stand out enough from its background.', 'People with low vision, and anyone using a phone in sunlight, cannot read it. WCAG asks for a contrast ratio of 4.5:1 for normal text and 3:1 for large text.', 'Darken the text or lighten the background (or the other way round) until a contrast checker passes. Check your design tokens, not just this screen.'],
  'image-alt': ['Images have no text alternative.', 'Screen readers announce the file name or nothing, so blind visitors miss what the image shows.', 'Add alt text that says what the image shows or does. Use alt="" only for decoration.'],
  'button-name': ['Some buttons have no name a screen reader can announce.', 'Icon-only buttons are announced as just "button", so people cannot tell what they do.', 'Add visible text, or an aria-label such as aria-label="Close menu".'],
  'link-name': ['Some links have no readable name.', 'Screen readers announce them as "link" with no destination, often because they wrap only an icon or image.', 'Add text inside the link, an aria-label, or alt text on the image inside it.'],
  'select-name': ['Drop-down menus have no label.', 'Screen readers announce them as just "combo box", so people do not know what they are choosing (size, colour, quantity…).', 'Add a visible <label> linked to each select, or aria-label if the design has no room for one.'],
  label: ['Form fields have no label.', 'Screen readers cannot say what to type, and placeholder text disappears as soon as someone starts typing.', 'Add a visible <label> linked to each field (or aria-label if a visible label truly does not fit the design).'],
  'heading-order': ['Headings skip levels (for example, h2 straight to h4).', 'Screen reader users jump between headings to scan a page; skipped levels make the structure confusing.', 'Pick heading levels by structure, not size, and use CSS for the size.'],
  'landmark-one-main': ['The page has no main landmark.', 'Screen reader users use landmarks to jump straight to the content.', 'Wrap the main content in <main>.'],
  region: ['Some content sits outside any page landmark.', 'Screen reader users can miss it when jumping between header, main and footer.', 'Put content inside <header>, <nav>, <main> or <footer>.'],
  'page-has-heading-one': ['The page has no main heading (h1).', 'Screen readers and search engines use the h1 to understand what the page is about.', 'Give each page one h1 that describes it. It can be styled however you like.'],
  'html-has-lang': ['The page does not declare its language.', 'Screen readers may read the text with the wrong pronunciation.', 'Add lang="en" (or your language) to <html>.'],
  'meta-viewport': ['The page stops people from zooming.', 'People with low vision rely on pinch-to-zoom.', 'Remove maximum-scale and user-scalable=no from the viewport meta tag.'],
  'target-size': ['Some buttons or links are too small or too close together to tap reliably.', 'People with larger fingers, tremors or a phone in one hand will hit the wrong thing.', 'Make tap areas at least 24x24px (44x44px is better), using padding if the icon itself is small.'],
  'aria-hidden-focus': ['Hidden content can still be reached with the keyboard.', 'Keyboard users land on things they cannot see, often inside closed menus or modals.', 'Add inert or tabindex="-1" to focusable elements inside hidden content, or remove them from the page while hidden.'],
  'nested-interactive': ['Clickable elements are nested inside other clickable elements.', 'Screen readers and keyboards cannot reach the inner control reliably, for example a button inside a link card.', 'Separate them: make the card a link and place the button beside it, not inside.'],
  'duplicate-id': ['Several elements share the same id.', 'Labels and ARIA references can point at the wrong element, so fields are announced wrongly.', 'Give each id a unique value (React: useId()).'],
}

function fmtMs(ms) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`
}

const PERF_SCRIPT = () => {
  window.__preflight = { lcp: 0, cls: 0 }
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__preflight.lcp = e.startTime
    }).observe({ type: 'largest-contentful-paint', buffered: true })
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (!e.hadRecentInput) window.__preflight.cls += e.value
    }).observe({ type: 'layout-shift', buffered: true })
  } catch {
    /* observers not supported */
  }
}

async function pageFacts(page, mobile) {
  return page.evaluate((mobile) => {
    const vw = window.innerWidth
    const describe = (el) => {
      const id = el.id ? `#${el.id}` : ''
      const cls = typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''
      return `${el.tagName.toLowerCase()}${id}${cls}`.slice(0, 80)
    }
    const visible = (el) => {
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0
    }
    const facts = {
      h1: document.querySelectorAll('h1').length,
      title: document.title,
      overflow: 0,
      wide: [],
      smallTargets: [],
      smallInputs: [],
      images: [],
    }
    if (mobile) {
      facts.overflow = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0) - vw
      if (facts.overflow > 1) {
        for (const el of document.querySelectorAll('body *')) {
          const r = el.getBoundingClientRect()
          if (r.right > vw + 1 && r.width > 0 && getComputedStyle(el).position !== 'fixed') {
            const parentWide = el.parentElement && el.parentElement.getBoundingClientRect().right > vw + 1
            if (!parentWide) facts.wide.push(`${describe(el)} (${Math.round(r.right - vw)}px too wide)`)
            if (facts.wide.length >= 5) break
          }
        }
      }
      for (const el of document.querySelectorAll('a[href], button, [role="button"], input:not([type="hidden"]), select, textarea, summary')) {
        if (!visible(el)) continue
        const r = el.getBoundingClientRect()
        const inline = el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.closest('p, li')
        if (!inline && (r.width < 24 || r.height < 24)) facts.smallTargets.push(`${describe(el)} ${Math.round(r.width)}x${Math.round(r.height)}px`)
      }
      for (const el of document.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]), select, textarea')) {
        if (!visible(el)) continue
        const size = parseFloat(getComputedStyle(el).fontSize)
        if (size < 16) facts.smallInputs.push(`${describe(el)} ${size}px`)
      }
    }
    const dpr = window.devicePixelRatio || 1
    const resources = new Map(performance.getEntriesByType('resource').map((e) => [e.name, e]))
    for (const img of document.images) {
      if (!img.currentSrc || !visible(img)) continue
      const r = img.getBoundingClientRect()
      const entry = resources.get(img.currentSrc)
      const bytes = entry ? entry.encodedBodySize || entry.transferSize || 0 : 0
      const tooBig = img.naturalWidth > r.width * dpr * 2 && img.naturalWidth > 800
      if (bytes > 300_000 || (tooBig && bytes > 100_000)) facts.images.push({ src: img.currentSrc.split('?')[0].slice(-80), bytes, natural: img.naturalWidth, shown: Math.round(r.width) })
    }
    return facts
  }, mobile)
}

export async function run(ctx) {
  const { root, stack, options } = ctx
  const findings = []
  let server
  let browser
  try {
    server = await ensureServer(root, stack, { url: options.url, preferProduction: Boolean(ctx.built), log: ctx.log })
  } catch (err) {
    ctx.notChecked.push(`Pages in a real browser: the site could not be started (${String(err.message).split('\n')[0]}). Start it yourself and run again with --url http://localhost:PORT.`)
    return findings
  }
  try {
    browser = await launchBrowser()
    const page = await browser.newPage()
    await page.evaluateOnNewDocument(PERF_SCRIPT)

    const events = { console: [], errors: [], failed: [] }
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !/^Failed to load resource/.test(msg.text())) events.console.push(msg.text().slice(0, 300))
    })
    page.on('pageerror', (err) => events.errors.push(String(err.message || err).slice(0, 300)))
    page.on('requestfailed', (req) => {
      const reason = req.failure()?.errorText || ''
      if (!/ERR_ABORTED|ERR_BLOCKED_BY_CLIENT/.test(reason)) events.failed.push(`${req.url().slice(0, 160)} (${reason})`)
    })
    page.on('response', (res) => {
      const type = res.request().resourceType()
      if (res.status() >= 400 && type !== 'document' && !/\/_next\/webpack-hmr|__vite_ping|favicon\.ico$/.test(res.url())) events.failed.push(`${res.url().slice(0, 160)} (${res.status()})`)
    })

    await setViewport(page, 'desktop')
    const { screens, source, skipped } = await discoverScreens(page, server.url, { routes: options.routes, routesFrom: options.routesFrom, root })
    ctx.screens = screens
    ctx.log(`Checking ${screens.length} screen(s) found by ${source}…`)
    if (skipped.length) ctx.notChecked.push(`Screens with no example link to follow (so not opened): ${skipped.slice(0, 8).join(', ')}${skipped.length > 8 ? '…' : ''}.`)
    if (server.mode === 'development') ctx.notChecked.push('Speed: measured on a development server, which is slower than the published site. Treat speed findings as a hint, and confirm with PageSpeed Insights once it is live.')

    const axeHits = new Map()
    const perScreen = (id) => {
      if (!axeHits.has(id)) axeHits.set(id, [])
      return axeHits.get(id)
    }
    const grouped = { overflow: [], targets: [], inputs: [], images: [], h1none: [], h1many: [], console: [], errors: [], failed: [], slow: [], shifty: [], status: [] }

    for (const screen of screens) {
      const started = Date.now()
      for (const vp of ['desktop', 'iphone', 'android']) {
        await setViewport(page, vp)
        events.console.length = 0
        events.errors.length = 0
        events.failed.length = 0
        let res
        try {
          res = await visit(page, joinUrl(server.url, screen.path))
        } catch (err) {
          if (vp === 'desktop') grouped.status.push({ screen, detail: `could not load (${String(err.message).slice(0, 120)})` })
          continue
        }
        if (vp === 'desktop' && res && res.status() >= 400) grouped.status.push({ screen, detail: `returns ${res.status()}` })
        const mobile = vp !== 'desktop'
        const facts = await pageFacts(page, mobile)

        if (vp !== 'android') {
          await page.evaluate(axe.source)
          const result = await page.evaluate(
            (tags, exclude) => window.axe.run({ include: [document], exclude: exclude.map((s) => [s]) }, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] }),
            AXE_TAGS,
            IGNORE_SELECTORS,
          )
          for (const v of result.violations) {
            perScreen(v.id).push({ screen: screen.route, vp, impact: v.impact, help: v.help, helpUrl: v.helpUrl, tags: v.tags, targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')), count: v.nodes.length })
          }
        }
        if (vp === 'desktop') {
          if (facts.h1 === 0) grouped.h1none.push(screen.route)
          if (facts.h1 > 1) grouped.h1many.push(`${screen.route} (${facts.h1})`)
          if (events.errors.length) grouped.errors.push(...[...new Set(events.errors)].slice(0, 3).map((e) => `${screen.route}: ${e}`))
          if (events.console.length) grouped.console.push(...[...new Set(events.console)].slice(0, 3).map((e) => `${screen.route}: ${e}`))
          if (events.failed.length) grouped.failed.push(...[...new Set(events.failed)].slice(0, 4).map((e) => `${screen.route}: ${e}`))
        }
        if (mobile) {
          if (facts.overflow > 1) grouped.overflow.push({ screen: screen.route, vp, detail: `${facts.overflow}px — ${facts.wide.slice(0, 3).join(', ')}` })
          if (vp === 'iphone') {
            if (facts.smallTargets.length) grouped.targets.push({ screen: screen.route, count: facts.smallTargets.length, sample: facts.smallTargets.slice(0, 3) })
            if (facts.smallInputs.length) grouped.inputs.push({ screen: screen.route, sample: facts.smallInputs.slice(0, 3) })
            for (const img of facts.images) grouped.images.push({ screen: screen.route, ...img })
            const perf = await page.evaluate(() => window.__preflight || null)
            if (perf?.lcp > 4000) grouped.slow.push(`${screen.route}: main content appeared after ${fmtMs(perf.lcp)}`)
            if (perf?.cls > 0.1) grouped.shifty.push(`${screen.route}: layout shift score ${perf.cls.toFixed(2)}`)
          }
        }
      }
      ctx.log(`  ${screen.route} (${fmtMs(Date.now() - started)})`)
    }

    for (const [id, hits] of axeHits) {
      const screensHit = [...new Set(hits.map((h) => h.screen))]
      const first = hits[0]
      const plain = AXE_PLAIN[id]
      const worst = hits.some((h) => h.impact === 'critical' || h.impact === 'serious') ? 'P1' : AXE_SEVERITY[first.impact] || 'P2'
      const wcag = first.tags.filter((t) => /^wcag\d/.test(t) && !/^wcag2a+$|^wcag2\d?a+$/.test(t)).map((t) => t.replace(/^wcag(\d)(\d)(\d+)$/, 'WCAG $1.$2.$3'))
      findings.push({
        id: `a11y.${id}`,
        phase: 'standards',
        severity: first.tags.includes('best-practice') && worst === 'P1' ? 'P2' : worst,
        confidence: 'verified',
        screen: screensHit[0],
        screens: screensHit,
        what: `${plain ? plain[0] : `${first.help}.`} Found on ${screensHit.length === screens.length && screens.length > 1 ? 'every screen checked' : `${screensHit.length} screen${screensHit.length === 1 ? '' : 's'}`}.`,
        why: plain ? plain[1] : `This is an accessibility problem that affects people using screen readers, keyboards or zoom. ${first.helpUrl}`,
        fix: plain ? plain[2] : `See ${first.helpUrl} for how to fix it.`,
        effort: screensHit.length > 3 ? 'half a day' : '30 min',
        evidence: hits.slice(0, 6).map((h) => `${h.screen} [${VIEWPORTS[h.vp].label}] ${h.count} element(s): ${h.targets.join(' | ')}`).join('\n'),
        evidenceKey: id,
        source: ['axe-core by Deque (MPL-2.0)', ...wcag, first.helpUrl],
      })
    }

    const list = (items) => items.slice(0, 8).join('\n')
    if (grouped.overflow.length) {
      const s = [...new Set(grouped.overflow.map((o) => o.screen))]
      findings.push({ id: 'runtime.horizontal-scroll', phase: 'devices', severity: 'P1', confidence: 'verified', screen: s[0], screens: s, what: `On phones, ${s.length === 1 ? "1 screen is" : `${s.length} screens are`} wider than the screen and scroll sideways.`, why: 'The page wobbles left and right as people scroll, and content can be cut off on the right. It is one of the most common reasons a site "feels broken" on mobile.', fix: 'Find the element named below (often a fixed-width image, table, long word or 100vw element) and give it max-width: 100% or let it wrap.', effort: '30 min', evidence: list(grouped.overflow.map((o) => `${o.screen} [${VIEWPORTS[o.vp].label}] ${o.detail}`)), evidenceKey: 'overflow', source: ['preflight'] })
    }
    if (grouped.targets.length) {
      const s = grouped.targets.map((t) => t.screen)
      findings.push({ id: 'runtime.small-tap-targets', phase: 'devices', severity: 'P2', confidence: 'needs-human', screen: s[0], screens: s, what: `Some buttons and links are smaller than 24x24px on phones (${grouped.targets.reduce((n, t) => n + t.count, 0)} across ${s.length} screen(s)).`, why: 'Small targets are easy to miss with a thumb. WCAG 2.2 asks for at least 24x24px, and Apple and Google recommend about 44x44px.', fix: 'Add padding so each tap area is at least 24px (ideally 44px), even if the icon stays small. Spacing between targets also counts.', effort: '30 min', evidence: list(grouped.targets.map((t) => `${t.screen}: ${t.sample.join(', ')}`)), evidenceKey: 'targets', source: ['WCAG 2.2 SC 2.5.8'] })
    }
    if (grouped.inputs.length) {
      const s = grouped.inputs.map((t) => t.screen)
      findings.push({ id: 'runtime.input-zoom', phase: 'devices', severity: 'P1', confidence: 'verified', screen: s[0], screens: s, what: `Form fields on ${s.length} screen(s) use text smaller than 16px on phones.`, why: 'Safari on iPhone zooms the page in when someone taps these fields, and does not zoom back out, so the layout looks broken mid-form.', fix: 'Set form fields to at least 16px on small screens (text-base in Tailwind).', effort: '5 min', evidence: list(grouped.inputs.map((t) => `${t.screen}: ${t.sample.join(', ')}`)), evidenceKey: 'inputs', source: ['safari-webkit-skill (MIT)'] })
    }
    if (grouped.images.length) {
      const total = grouped.images.reduce((n, i) => n + i.bytes, 0)
      const s = [...new Set(grouped.images.map((i) => i.screen))]
      findings.push({ id: 'runtime.heavy-images', phase: 'performance', severity: 'P2', confidence: 'verified', screen: s[0], screens: s, what: `${grouped.images.length === 1 ? "1 image is" : `${grouped.images.length} images are`} heavier than they need to be on phones (about ${Math.round(total / 1024)} KB in total).`, why: 'Phones on mobile data download every byte. Large images are the most common reason a page feels slow to appear.', fix: 'Export images at no more than twice the size they are shown, in WebP or AVIF, and use srcset or your framework\'s image component so phones get smaller files.', effort: '30 min', evidence: list(grouped.images.map((i) => `${i.screen}: ${i.src} ${Math.round(i.bytes / 1024)} KB, ${i.natural}px wide shown at ${i.shown}px`)), evidenceKey: 'images', source: ['preflight'] })
    }
    if (grouped.h1none.length && !axeHits.has('page-has-heading-one')) {
      findings.push({ id: 'runtime.no-h1', phase: 'standards', severity: 'P2', confidence: 'verified', screen: grouped.h1none[0], screens: grouped.h1none, what: `${grouped.h1none.length === 1 ? "1 screen has" : `${grouped.h1none.length} screens have`} no main heading (h1).`, why: 'Screen readers and search engines use the h1 to understand what each page is about.', fix: 'Give each page one h1 describing it. Style it however you like.', effort: '5 min', evidence: list(grouped.h1none), evidenceKey: 'h1none', source: ['preflight'] })
    }
    if (grouped.h1many.length) {
      findings.push({ id: 'runtime.many-h1', phase: 'standards', severity: 'P2', confidence: 'needs-human', screen: grouped.h1many[0].split(' ')[0], what: `${grouped.h1many.length === 1 ? "1 screen has" : `${grouped.h1many.length} screens have`} more than one main heading (h1).`, why: 'More than one h1 makes it unclear what the page is about, for screen readers and search engines.', fix: 'Keep one h1 per page and make the others h2 (they can keep the same look).', effort: '5 min', evidence: list(grouped.h1many), evidenceKey: 'h1many', source: ['preflight'] })
    }
    if (grouped.errors.length) {
      findings.push({ id: 'runtime.page-errors', phase: 'states', severity: 'P1', confidence: 'verified', screen: grouped.errors[0].split(':')[0], what: `The code crashes with errors while screens load (${grouped.errors.length} error(s)).`, why: 'An uncaught error usually means part of the page stops working, such as a button that does nothing or a section that never appears.', fix: 'Open the screen with the browser developer tools Console open, and fix the first error listed below. Later errors often follow from it.', effort: '30 min', evidence: list(grouped.errors), evidenceKey: 'pageerror', source: ['preflight'] })
    }
    if (grouped.console.length) {
      findings.push({ id: 'runtime.console-errors', phase: 'states', severity: 'P2', confidence: 'needs-human', screen: grouped.console[0].split(':')[0], what: `Screens log ${grouped.console.length} error message(s) in the browser console.`, why: 'Console errors are often early warnings (a failed request, a hydration mismatch, a missing key) of something that breaks for some visitors.', fix: 'Read each message below and fix the cause, or remove the log if it is expected.', effort: '30 min', evidence: list(grouped.console), evidenceKey: 'console', source: ['preflight'] })
    }
    if (grouped.failed.length) {
      findings.push({ id: 'runtime.failed-requests', phase: 'states', severity: 'P1', confidence: 'verified', screen: grouped.failed[0].split(':')[0], what: `${grouped.failed.length === 1 ? "1 file or data request fails" : `${grouped.failed.length} files or data requests fail`} while screens load.`, why: 'Missing images, fonts, scripts or data show up as broken images, fallback fonts, empty sections or features that never load.', fix: 'Check each address below: fix the path, add the missing file, or fix the API it calls.', effort: '30 min', evidence: list(grouped.failed), evidenceKey: 'failed', source: ['preflight'] })
    }
    if (grouped.status.length) {
      findings.push({ id: 'runtime.screen-errors', phase: 'states', severity: 'P1', confidence: 'verified', screen: grouped.status[0].screen.route, screens: grouped.status.map((s) => s.screen.route), what: `${grouped.status.length === 1 ? "1 screen fails" : `${grouped.status.length} screens fail`} to load.`, why: 'Visitors who follow a link to these screens get an error page instead.', fix: 'Open each screen listed and fix the error, or remove links to it.', effort: '30 min', evidence: list(grouped.status.map((s) => `${s.screen.route} ${s.detail}`)), evidenceKey: 'status', source: ['preflight'] })
    }
    if (grouped.slow.length) {
      findings.push({ id: 'runtime.slow-lcp', phase: 'performance', severity: 'P2', confidence: 'needs-human', screen: grouped.slow[0].split(':')[0], what: `The main content takes more than 4 seconds to appear on ${grouped.slow.length} screen(s) (emulated phone).`, why: 'Google counts over 2.5 seconds as slow (Largest Contentful Paint). Many visitors leave before the page appears.', fix: 'Usually the biggest image or font. Make the hero image smaller, preload it, and avoid loading it with JavaScript. Confirm on the live site with PageSpeed Insights.', effort: 'half a day', evidence: list(grouped.slow), evidenceKey: 'lcp', source: ['web.dev Core Web Vitals'] })
    }
    if (grouped.shifty.length) {
      findings.push({ id: 'runtime.layout-shift', phase: 'performance', severity: 'P2', confidence: 'needs-human', screen: grouped.shifty[0].split(':')[0], what: `Content jumps around while ${grouped.shifty.length} screen(s) load.`, why: 'People tap the wrong thing when buttons move under their finger. Google counts a layout shift score over 0.1 as poor.', fix: 'Give images and embeds a width and height (or aspect-ratio), reserve space for banners and late-loading content, and avoid inserting content above what is already shown.', effort: '30 min', evidence: list(grouped.shifty), evidenceKey: 'cls', source: ['web.dev Core Web Vitals'] })
    }

    await setViewport(page, 'desktop')
    try {
      const res = await visit(page, joinUrl(server.url, `/preflight-missing-page-${Date.now().toString(36)}`))
      const text = await page.evaluate(() => document.body?.innerText?.slice(0, 400) || '')
      if (res && res.status() === 200) {
        findings.push({ id: 'runtime.no-404-status', phase: 'states', severity: 'P2', confidence: 'needs-human', screen: '/404', what: 'A page that does not exist still loads as if it were a real page.', why: 'Search engines index broken links as real pages, and visitors with a mistyped link see a confusing screen instead of a helpful "not found" message.', fix: 'Return a 404 status for unknown addresses and show a not-found page that links back to the main sections.', effort: '30 min', evidence: text.slice(0, 200), evidenceKey: 'no404', source: ['preflight'] })
      } else if (/This page could not be found|404: NOT_FOUND|^Not found$|Cannot GET/i.test(text.trim())) {
        findings.push({ id: 'runtime.default-404', phase: 'states', severity: 'P2', confidence: 'verified', screen: '/404', what: 'The "page not found" screen is a plain default with no design.', why: 'Visitors who follow an old or mistyped link land on an unstyled dead end with no way back.', fix: stack.framework.id === 'next' ? 'Add app/not-found.tsx with your header, a short friendly message and links to the main sections.' : 'Add a styled 404 page with a friendly message and links back to the main sections.', effort: '30 min', evidence: text.slice(0, 120), evidenceKey: 'default404', source: ['preflight'] })
      }
    } catch {
      /* not important enough to fail the run */
    }

    if (server.mode === 'given' && !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(server.url)) {
      try {
        const res = await fetch(server.url, { redirect: 'follow', signal: AbortSignal.timeout(15_000) })
        const h = res.headers
        const missing = [
          !h.get('strict-transport-security') && 'Strict-Transport-Security (forces a secure connection)',
          !h.get('content-security-policy') && 'Content-Security-Policy (limits which scripts can run)',
          !h.get('x-content-type-options') && 'X-Content-Type-Options: nosniff',
          !h.get('x-frame-options') && !/frame-ancestors/.test(h.get('content-security-policy') || '') && 'X-Frame-Options or frame-ancestors (stops other sites framing yours)',
          !h.get('referrer-policy') && 'Referrer-Policy',
        ].filter(Boolean)
        if (missing.length) {
          findings.push({ id: 'runtime.security-headers', phase: 'security', severity: missing.length >= 4 ? 'P1' : 'P2', confidence: 'verified', what: `The live site is missing ${missing.length} recommended security header(s).`, why: 'Security headers tell browsers to block common attacks, such as other sites loading yours in a hidden frame to trick people into clicking, or injected scripts running.', fix: 'Add the headers in your hosting settings (vercel.json, netlify.toml, _headers or next.config headers()). Start with a report-only Content-Security-Policy so nothing breaks.', effort: '30 min', evidence: missing.join('\n'), evidenceKey: 'headers', source: ['OWASP Secure Headers Project', 'vibecoded-site-audit-skill (MIT)'] })
        }
      } catch {
        ctx.notChecked.push('Security headers on the live site: the site did not respond in time.')
      }
    } else {
      ctx.notChecked.push('Security headers: only checked on a live site. Run again with --url https://your-site.com once it is published.')
    }
    ctx.notChecked.push('Signed-in screens: pages behind a login were seen as signed-out visitors see them.')
  } catch (err) {
    ctx.notChecked.push(`Pages in a real browser: the check stopped early (${String(err.message || err).split('\n')[0].slice(0, 200)}).`)
  } finally {
    await browser?.close().catch(() => {})
    await server?.stop().catch(() => {})
  }
  return findings
}
