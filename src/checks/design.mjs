import { excerpt } from '../files.mjs'

export const name = 'design'
export const phases = ['leftovers', 'security']

const STYLEISH = /\.(css|scss|sass|less|m?[jt]sx?|vue|svelte|astro|html?)$/i
const HEX = /(?<![\w&])#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g
const RGB = /\b(?:rgba?|hsla?)\(\s*[\d.]+(?:deg)?[\s,]+[\d.]+%?[\s,]+[\d.]+%?(?:[\s,/]+[\d.]+%?)?\s*\)/g

function f(partial) {
  return { phase: 'leftovers', severity: 'P2', confidence: 'needs-human', effort: '30 min', source: ['preflight'], ...partial }
}

function toRgb(hex) {
  let h = hex.slice(1)
  if (h.length <= 4) h = [...h].map((c) => c + c).join('')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
}

function distance(a, b) {
  const [r1, g1, b1] = toRgb(a)
  const [r2, g2, b2] = toRgb(b)
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2)
}

/** Colours, z-index, !important, breakpoints and fonts tell you whether a design system is actually in use. */
export async function run(ctx) {
  const { project, stack } = ctx
  const findings = []
  const files = project.matching(STYLEISH).filter((p) => !/(^|\/)(public|static)\/.*\.min\.|\.min\.(css|js)$|(^|\/)(vendor|third[-_]party)\//.test(p))

  const tokenDefs = new Set()
  const rawColours = new Map()
  let rawCount = 0
  let tokenFiles = 0
  const arbitrary = []
  const zValues = new Map()
  let important = 0
  let importantFile = null
  const breakpoints = new Set()
  const fonts = new Map()

  for (const file of files) {
    const text = project.text(file)
    if (!text) continue
    const definesTokens = /--[\w-]+\s*:\s*(#|rgb|hsl|oklch|color)/.test(text) || /@theme\b/.test(text)
    if (definesTokens) tokenFiles++
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      const isTokenDef = /^--[\w-]+\s*:/.test(trimmed) || /^['"]?[\w-]+['"]?\s*:\s*['"]#/.test(trimmed) && /tailwind\.config|theme|tokens?/i.test(file)
      for (const m of trimmed.matchAll(HEX)) {
        if (isTokenDef) tokenDefs.add(m[0].toLowerCase())
        else if (!/url\(|href=|&#|#[0-9a-f]{3,8}\]?\)?;?\s*\/\//i.test(trimmed) && !/^\s*(\/\/|\*|<!--)/.test(trimmed)) {
          const key = m[0].toLowerCase()
          rawCount++
          if (!rawColours.has(key)) rawColours.set(key, file)
        }
      }
      for (const m of trimmed.matchAll(RGB)) {
        if (!isTokenDef) rawCount++
      }
    }
    for (const m of text.matchAll(/\b[a-z-]+-\[(?:#[0-9a-f]{3,8}|\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw))\]/gi)) arbitrary.push({ file, value: m[0] })
    for (const m of text.matchAll(/z-index\s*:\s*(-?\d+)|\bz-\[?(-?\d+)\]?\b|zIndex\s*:\s*(-?\d+)/g)) {
      const v = Number(m[1] ?? m[2] ?? m[3])
      zValues.set(v, (zValues.get(v) || 0) + 1)
    }
    const imp = (text.match(/!important/g) || []).length
    if (imp && !importantFile) importantFile = file
    important += imp
    for (const m of text.matchAll(/@media[^{]*\((?:min|max)-width\s*:\s*(\d+(?:\.\d+)?)(px|em|rem)\)/g)) breakpoints.add(`${m[1]}${m[2]}`)
    for (const m of text.matchAll(/fonts\.googleapis\.com\/css2?\?family=([^"'&)]+)/g)) {
      for (const fam of decodeURIComponent(m[1]).split('|')) {
        const family = fam.split(':')[0].replace(/\+/g, ' ')
        fonts.set(family, [...(fonts.get(family) || []), { file, via: 'Google Fonts link' }])
      }
    }
    for (const m of text.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]next\/font\/google['"]/g)) {
      for (const family of m[1].split(',').map((s) => s.trim().replace(/_/g, ' ')).filter(Boolean)) fonts.set(family, [...(fonts.get(family) || []), { file, via: 'next/font' }])
    }
    for (const m of text.matchAll(/@font-face\s*{[^}]*font-family\s*:\s*['"]?([^;'"]+)/g)) fonts.set(m[1].trim(), [...(fonts.get(m[1].trim()) || []), { file, via: '@font-face' }])
  }

  const unique = [...rawColours.keys()]
  const near = []
  const palette = [...unique, ...[...tokenDefs].filter((c) => !rawColours.has(c))]
  for (let i = 0; i < unique.length && near.length < 12; i++) {
    for (let j = i + 1; j < palette.length; j++) {
      const d = distance(unique[i], palette[j])
      if (d > 0 && d < 10) {
        near.push(`${unique[i]} ~ ${palette[j]}${tokenDefs.has(palette[j]) ? ' (token)' : ''}`)
        break
      }
    }
  }
  const drifting = rawCount >= 25 || unique.length >= 15
  if (!drifting && near.length) {
    findings.push(f({
      id: 'design.near-colours',
      file: rawColours.get(near[0].split(' ')[0]),
      what: `${near.length === 1 ? '1 colour is' : `${near.length} colours are`} almost, but not exactly, the same as another (${near.slice(0, 3).join(', ')}).`,
      why: 'Shades that differ by a hair usually come from different build passes guessing the brand colour. Side by side they look slightly off, and changing the brand colour later misses some of them.',
      fix: stack.tailwind ? 'Pick the right shade, define it once as a Tailwind theme colour, and use the token name everywhere.' : 'Pick the right shade, define it once as a CSS custom property (for example --color-brand), and use var(--color-brand) everywhere.',
      effort: '30 min',
      evidence: near.join('\n'),
    }))
  }
  if (drifting) {
    findings.push(f({
      id: 'design.raw-colours',
      file: rawColours.values().next().value,
      what: `Colours are typed directly ${rawCount} times (${unique.length} different values)${tokenFiles ? ', even though the project defines colour tokens' : ''}.`,
      why: `When colours are typed by hand instead of using named tokens, the palette drifts with every build pass. Changing the brand colour or adding dark mode then means hunting through every file.${near.length ? ` Some are almost identical (${near.slice(0, 4).join(', ')}), which usually means two passes picked slightly different shades.` : ''}`,
      fix: stack.tailwind ? 'Define the palette once as Tailwind theme colours, replace typed values with the token names, and merge near-identical shades.' : 'Define the palette once as CSS custom properties (for example --color-brand), replace typed values with var(--…), and merge near-identical shades.',
      effort: 'half a day',
      evidence: unique.slice(0, 20).join(' '),
    }))
  }
  if (arbitrary.length >= 15) {
    findings.push(f({
      id: 'design.arbitrary-values',
      file: arbitrary[0].file,
      what: `${arbitrary.length} one-off Tailwind values bypass the design scale (for example ${[...new Set(arbitrary.map((a) => a.value))].slice(0, 4).join(', ')}).`,
      why: 'Values like w-[347px] are usually copied from a mock-up pixel by pixel. They do not scale with the rest of the design and make spacing inconsistent between screens.',
      fix: 'Swap each for the nearest value in the scale (w-80, text-lg, p-6), or add a named token when the value really is part of the design.',
    }))
  }
  const zs = [...zValues.keys()]
  if (zs.length >= 7 || zs.some((v) => v >= 999)) {
    findings.push(f({
      id: 'design.z-index',
      what: `${zs.length} different z-index (stacking order) values are used${zs.some((v) => v >= 999) ? `, including ${Math.max(...zs)}` : ''}.`,
      why: 'When each build pass picks a bigger number to get something on top, menus, modals and toasts end up hidden behind each other on some screens.',
      fix: 'Define a short named scale (for example base, dropdown, sticky, overlay, modal, toast) and use only those.',
      evidence: zs.sort((a, b) => a - b).join(', '),
    }))
  }
  if (important >= 15) {
    findings.push(f({ id: 'design.important', file: importantFile, what: `!important is used ${important} times.`, why: 'Each !important is a style fight that was won by force. The next change has to use even more force, and styles become unpredictable.', fix: 'Find why the normal rule lost (usually two components styling the same thing) and fix that instead.' }))
  }
  if (breakpoints.size >= 6) {
    findings.push(f({ id: 'design.breakpoints', what: `${breakpoints.size} different screen-width breakpoints are used (${[...breakpoints].slice(0, 8).join(', ')}).`, why: 'Layouts that change at many slightly different widths behave inconsistently between screens, especially on tablets and large phones.', fix: 'Agree a small set of breakpoints and use them everywhere.' }))
  }
  for (const [family, uses] of fonts) {
    const ways = [...new Set(uses.map((u) => u.via))]
    if (uses.length > 1 && (ways.length > 1 || new Set(uses.map((u) => u.file)).size > 1)) {
      findings.push(f({ id: 'design.font-loaded-twice', file: uses[0].file, what: `The font "${family}" is loaded ${uses.length} times (${ways.join(', ')}).`, why: 'Visitors download the same font more than once, slowing the first view, and two copies can render at slightly different weights.', fix: 'Load each font once, in one place (the root layout or a single stylesheet).', effort: '5 min', evidenceKey: family }))
    }
  }
  const googleLinks = project.grep(STYLEISH, /fonts\.(googleapis|gstatic)\.com/, { limit: 5 })
  if (googleLinks.length) {
    findings.push(f({
      id: 'design.google-fonts-remote',
      phase: 'security',
      severity: 'P2',
      file: googleLinks[0].file,
      line: googleLinks[0].line,
      what: 'Fonts are loaded from Google\'s servers.',
      why: 'Each visit sends the visitor\'s IP address to Google. A German court ruled this a GDPR breach without consent (Munich, 2022). It also adds a slower third-party request to every first view.',
      fix: stack.framework.id === 'next' ? 'Use next/font/google, which downloads the font at build time and serves it from your own site.' : 'Self-host the font files (for example with Fontsource) and remove the Google Fonts link.',
      effort: '30 min',
      evidence: excerpt(googleLinks[0].text, googleLinks[0].index),
    }))
  }
  return findings
}
