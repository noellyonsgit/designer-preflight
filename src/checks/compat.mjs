import { features } from 'web-features'
import { localBin, run as exec } from '../util.mjs'

export const name = 'compat'
export const phases = ['devices']

const CSS = /\.(css|scss|sass|less|vue|svelte|astro|html?)$/i
const CSS_AND_CLASSES = /\.(css|scss|sass|less|[jt]sx|vue|svelte|astro|html?)$/i
const JS = /\.(m?[jt]sx?|vue|svelte|astro)$/i

/** Patterns that reveal a feature in source. `prefixable` features are fixed automatically by Autoprefixer, Tailwind v4 and Lightning CSS. */
const DETECT = [
  { id: 'has', label: 'the :has() selector', files: CSS_AND_CLASSES, re: /:has\(|\bhas-\[/ },
  { id: 'container-queries', label: 'container queries', files: CSS_AND_CLASSES, re: /@container\b|container-type\s*:|\b@container\b|\b@(sm|md|lg|xl):/ },
  { id: 'subgrid', label: 'subgrid', files: CSS_AND_CLASSES, re: /\bsubgrid\b/ },
  { id: 'text-wrap-balance', label: 'text-wrap: balance', files: CSS_AND_CLASSES, re: /text-wrap\s*:\s*balance|\btext-balance\b/ },
  { id: 'text-wrap-pretty', label: 'text-wrap: pretty', files: CSS_AND_CLASSES, re: /text-wrap\s*:\s*pretty|\btext-pretty\b/ },
  { id: 'starting-style', label: '@starting-style entry animations', files: CSS_AND_CLASSES, re: /@starting-style|\bstarting:/ },
  { id: 'view-transitions', label: 'view transitions', files: /./, re: /startViewTransition|view-transition-name|::view-transition/ },
  { id: 'popover', label: 'the popover attribute', files: /\.(html?|[jt]sx|vue|svelte|astro)$/, re: /\bpopover(?:=|Target=|target=|\s)|\.showPopover\(/ },
  { id: 'anchor-positioning', label: 'CSS anchor positioning', files: CSS_AND_CLASSES, re: /anchor-name\s*:|position-anchor\s*:|\banchor\(/ },
  { id: 'field-sizing', label: 'field-sizing (auto-growing fields)', files: CSS_AND_CLASSES, re: /field-sizing\s*:|\bfield-sizing-content\b/ },
  { id: 'scroll-driven-animations', label: 'scroll-driven animations', files: CSS_AND_CLASSES, re: /animation-timeline\s*:|scroll-timeline|view-timeline/ },
  { id: 'backdrop-filter', label: 'backdrop-filter without the -webkit- prefix', files: CSS, re: /(?<!-webkit-)backdrop-filter\s*:/, prefixable: true, needsAbsent: /-webkit-backdrop-filter/ },
  { id: 'color-mix', label: 'color-mix()', files: CSS_AND_CLASSES, re: /color-mix\(/ },
  { id: 'relative-color', label: 'relative colour syntax', files: CSS_AND_CLASSES, re: /(?:rgb|hsl|oklch|oklab|lab|lch)a?\(\s*from\s/ },
  { id: 'light-dark', label: 'light-dark()', files: CSS_AND_CLASSES, re: /light-dark\(/ },
  { id: 'scrollbar-gutter', label: 'scrollbar-gutter', files: CSS_AND_CLASSES, re: /scrollbar-gutter\s*:/ },
  { id: 'content-visibility', label: 'content-visibility', files: CSS_AND_CLASSES, re: /content-visibility\s*:/ },
  { id: 'array-group', label: 'Object.groupBy / Map.groupBy', files: JS, re: /\b(?:Object|Map)\.groupBy\(/ },
  { id: 'promise-withresolvers', label: 'Promise.withResolvers()', files: JS, re: /Promise\.withResolvers\(/ },
  { id: 'navigation', label: 'the Navigation API', files: JS, re: /\bwindow\.navigation\b|\bnavigation\.navigate\(/ },
  { id: 'dialog-closedby', label: 'the dialog closedby attribute', files: /\.(html?|[jt]sx|vue|svelte|astro)$/, re: /\bclosedby=|closedBy=/ },
  { id: 'nesting', label: 'native CSS nesting', files: /\.css$/, re: /\{[^{}]*\n\s*&[\s:.[>+~]/, prefixable: true },
]

const BROWSERSLIST_KEYS = { ios_saf: 'safari_ios', safari: 'safari', chrome: 'chrome', and_chr: 'chrome_android', firefox: 'firefox', and_ff: 'firefox_android', edge: 'edge' }
const LABEL = { safari_ios: 'Safari on iPhone', chrome_android: 'Chrome on Android', safari: 'Safari on Mac', chrome: 'Chrome', firefox: 'Firefox', firefox_android: 'Firefox on Android', edge: 'Edge' }

function cmp(a, b) {
  const pa = String(a).split('.').map(Number)
  const pb = String(b).split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d) return d
  }
  return 0
}

async function targets(ctx) {
  if (!ctx.stack.browserslist) return null
  const bin = localBin(ctx.root, 'browserslist')
  if (!bin) {
    ctx.notChecked.push('Browser targets: a browserslist config exists but the browserslist package is not installed, so Baseline "widely available" was used instead.')
    return null
  }
  const res = await exec(bin, [], { cwd: ctx.root, timeoutMs: 30_000 })
  if (res.code !== 0) return null
  const min = {}
  for (const line of res.out.split('\n')) {
    const [key, range] = line.trim().split(' ')
    const browser = BROWSERSLIST_KEYS[key]
    if (!browser || !range) continue
    const version = range.split('-')[0]
    if (!min[browser] || cmp(version, min[browser]) < 0) min[browser] = version
  }
  return Object.keys(min).length ? min : null
}

function hasBuildPrefixing(stack) {
  return Boolean(stack.deps.autoprefixer || stack.deps.lightningcss || stack.deps['postcss-preset-env'] || (stack.tailwind?.major >= 4) || ['next', 'nuxt', 'sveltekit', 'astro'].includes(stack.framework.id))
}

export async function run(ctx) {
  const { project, stack } = ctx
  const findings = []
  const target = await targets(ctx)
  const prefixed = hasBuildPrefixing(stack)
  const basis = target ? `your browser targets (${Object.entries(target).map(([b, v]) => `${LABEL[b]} ${v}`).join(', ')})` : 'Baseline "widely available" (no browser targets are set)'

  for (const rule of DETECT) {
    if (rule.prefixable && prefixed) continue
    const feature = features[rule.id]
    if (!feature?.status) continue
    let hits = project.grep(rule.files, rule.re, { limit: 40 })
    if (rule.needsAbsent) hits = hits.filter((h) => !rule.needsAbsent.test(h.text))
    hits = hits.filter((h) => !new RegExp(`@supports[^{]*${rule.id.split('-')[0]}`, 'i').test(h.text))
    if (!hits.length) continue
    const support = feature.status.support || {}
    let missing
    if (target) {
      missing = Object.entries(target).filter(([browser, min]) => !support[browser] || cmp(support[browser], min) > 0).map(([browser]) => browser)
      if (!missing.length) continue
    } else {
      if (feature.status.baseline === 'high') continue
      missing = ['safari_ios', 'chrome_android', 'safari', 'chrome', 'firefox'].filter((b) => !support[b])
    }
    const mobile = missing.filter((b) => b === 'safari_ios' || b === 'chrome_android')
    const limited = feature.status.baseline === false
    const versions = ['safari_ios', 'chrome_android'].map((b) => `${LABEL[b]} ${support[b] ? `${support[b]}+` : 'not supported'}`).join(', ')
    findings.push({
      id: `compat.${rule.id}`,
      phase: 'devices',
      severity: limited && mobile.length ? 'P1' : 'P2',
      confidence: 'needs-human',
      file: hits[0].file,
      line: hits[0].line,
      what: `The site uses ${rule.label}, which ${limited ? 'does not work everywhere yet' : 'only arrived in browsers recently'} (${versions}).`,
      why: `${missing.length ? `${missing.map((b) => LABEL[b]).join(', ')} ${limited ? 'cannot' : 'may not'} show this as designed. ` : `Visitors on older iPhones or Android phones may not see this as designed. `}Checked against ${basis}. If the design still works without it (a progressive enhancement), this is fine.`,
      fix: rule.id === 'backdrop-filter' ? 'Add -webkit-backdrop-filter with the same value next to it, or add Autoprefixer to the build.' : `Check the screen in a browser that lacks it. If it breaks, add a fallback inside @supports, or avoid the feature until it is Baseline "widely available".`,
      effort: '30 min',
      evidence: hits.slice(0, 4).map((h) => `${h.file}:${h.line}`).join('\n'),
      source: ['web-features (W3C WebDX CG, Apache-2.0)', 'MDN browser-compat-data (CC0)', 'can-i-use skill by ivklgn (MIT)'],
    })
  }

  const ric = project.grep(JS, /\brequestIdleCallback\(/, { limit: 5 })
  if (ric.length && !project.grep(JS, /['"]requestIdleCallback['"]\s+in\s+window|typeof\s+(window\.)?requestIdleCallback/, { limit: 1 }).length) {
    findings.push({
      id: 'compat.request-idle-callback',
      phase: 'devices',
      severity: 'P1',
      confidence: 'verified',
      file: ric[0].file,
      line: ric[0].line,
      what: 'The code calls requestIdleCallback, which Safari has not supported (and every browser on iPhone uses Safari\'s engine).',
      why: 'On iPhones the script stops with an error at that point, so whatever runs after it never happens.',
      fix: 'Check it exists first and fall back to setTimeout: (window.requestIdleCallback || ((cb) => setTimeout(cb, 1)))(…).',
      effort: '5 min',
      source: ['MDN browser-compat-data (CC0)'],
    })
  }

  if (stack.tailwind?.major >= 4 && target) {
    const tooOld = Object.entries({ safari_ios: '16.4', safari: '16.4', chrome: '111', chrome_android: '111', firefox: '128' }).filter(([b, v]) => target[b] && cmp(target[b], v) < 0)
    if (tooOld.length) {
      findings.push({
        id: 'compat.tailwind-v4-floor',
        phase: 'devices',
        severity: 'P1',
        confidence: 'verified',
        file: 'package.json',
        what: `Tailwind v4 needs Safari 16.4+, Chrome 111+ and Firefox 128+, but your targets include ${tooOld.map(([b]) => `${LABEL[b]} ${target[b]}`).join(', ')}.`,
        why: 'On those older browsers much of the styling does not apply, so pages can look unstyled.',
        fix: 'Either raise your browser targets, or stay on Tailwind v3.4 if you must support those devices.',
        effort: '30 min',
        source: ['https://tailwindcss.com/docs/compatibility'],
      })
    }
  }

  ctx.notChecked.push('Real devices: emulated phones in Chrome are not real iPhones or Android phones. Use the manual phone script in the report for the final check.')
  return findings
}
