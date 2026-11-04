import path from 'node:path'

const UI = /\.(jsx|tsx|vue|svelte|astro)$|\.module\.(css|scss|sass|less)$/
const TOKEN_FILE = /\.(css|scss|sass|less|js|cjs|mjs|ts)$/
const SKIP = /\.(test|spec|stories)\.[^/]+$|(^|\/)(__tests__|stories|e2e)\//
const HEX = /(?<![\w&])#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g
const RGB = /\b(?:rgba?|hsla?)\(\s*[\d.]+(?:deg)?[\s,]+[\d.]+%?[\s,]+[\d.]+%?(?:[\s,/]+[\d.]+%?)?\s*\)/g
const SPACING = /(?:^|[^-\w])(padding(?:-(?:top|right|bottom|left|inline|block|inline-start|inline-end))?|margin(?:-(?:top|right|bottom|left|inline|block|inline-start|inline-end))?|gap|row-gap|column-gap)\s*:\s*['"]?(\d+(?:\.\d+)?)(px)?(?![\w.%])/g
const TW_SPACING = /\b(?:p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|ms|me|gap|gap-x|gap-y|space-x|space-y)-\[(\d+(?:\.\d+)?)px\]/g

const MODIFIERS = ['primary', 'secondary', 'tertiary', 'app', 'base', 'custom', 'main', 'simple', 'basic', 'icon', 'cta', 'action', 'rounded', 'ghost', 'outline', 'outlined', 'solid', 'small', 'large', 'default', 'ui']
const ROLES = ['checkbox', 'textarea', 'dropdown', 'accordion', 'tooltip', 'popover', 'skeleton', 'spinner', 'button', 'dialog', 'banner', 'avatar', 'footer', 'header', 'navbar', 'select', 'switch', 'input', 'modal', 'badge', 'alert', 'toast', 'card', 'menu', 'tabs']
const VARIANT_PROPS = ['variant', 'size', 'intent', 'tone', 'color', 'colour', 'appearance', 'kind']

function isInk(hex) {
  let h = hex.slice(1).toLowerCase()
  if (h.length <= 4) h = [...h].map((c) => c + c).join('')
  return h.slice(0, 6) === '000000' || h.slice(0, 6) === 'ffffff'
}

function skipLine(line) {
  const trimmed = line.trim()
  return /^(\/\/|\*|<!--)/.test(trimmed) || /^--[\w-]+\s*:/.test(trimmed) || /url\(|&#/.test(trimmed)
}

/** Filename, or the folder name when the file is index.tsx inside Button/. */
export function componentName(file) {
  const base = path.basename(file).replace(/\.[^.]+$/, '')
  if (/^(index|component)$/i.test(base)) {
    const parent = path.basename(path.dirname(file))
    if (parent && !/^(components|ui|src)$/i.test(parent)) return parent
  }
  return base
}

/** PrimaryButton, CtaButton and Button all become "button". SubmitButton does not. */
export function componentRole(file) {
  const raw = componentName(file).replace(/(Old|New|Copy|V\d|\d+)$/i, '').replace(/[\s._-]+/g, '')
  const lower = raw.toLowerCase()
  for (const mod of MODIFIERS) {
    if (lower.startsWith(mod) && lower.length > mod.length && ROLES.includes(lower.slice(mod.length))) return lower.slice(mod.length)
  }
  return ROLES.includes(lower) ? lower : null
}

export function variantPropsIn(text, componentName) {
  const found = new Set()
  const name = componentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const blobs = []
  const patterns = [
    new RegExp(`(?:export\\s+(?:default\\s+)?)?function\\s+${name}\\s*\\(\\s*\\{([^}]{0,600})\\}`, 'g'),
    new RegExp(`(?:export\\s+(?:default\\s+)?)?(?:const|let)\\s+${name}\\s*=\\s*(?:React\\.forwardRef\\(\\s*)?\\(?\\s*\\{([^}]{0,600})\\}`, 'g'),
    /(?:interface|type)\s+\w*Props\b[^{]{0,80}\{([^}]{0,800})\}/g,
    /defineProps(?:\s*<\s*\{([^}]{0,800})\}|\s*\(\s*\{([^}]{0,800})\}\s*\))/g,
  ]
  for (const re of patterns) {
    for (const match of text.matchAll(re)) blobs.push(match[1] || match[2] || '')
  }
  for (const prop of VARIANT_PROPS) {
    if (new RegExp(`export\\s+let\\s+${prop}\\b`).test(text)) found.add(prop)
  }
  for (const blob of blobs) {
    for (const prop of VARIANT_PROPS) {
      if (new RegExp(`\\b${prop}\\b`).test(blob)) found.add(prop)
    }
  }
  return [...found]
}

function colourHits(text) {
  const hits = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (skipLine(lines[i])) continue
    for (const match of lines[i].matchAll(HEX)) {
      if (!isInk(match[0])) hits.push({ line: i + 1, value: match[0].toLowerCase() })
    }
    for (const match of lines[i].matchAll(RGB)) hits.push({ line: i + 1, value: match[0].replace(/\s+/g, '') })
  }
  return hits
}

function spacingHits(text) {
  const hits = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (skipLine(lines[i])) continue
    const seen = new Set()
    for (const match of lines[i].matchAll(SPACING)) {
      const amount = Number(match[2])
      if (amount <= 1) continue
      const label = `${match[1]}: ${match[2]}${match[3] || ''}`
      if (seen.has(label)) continue
      seen.add(label)
      hits.push({ line: i + 1, value: label })
    }
    for (const match of lines[i].matchAll(TW_SPACING)) {
      if (Number(match[1]) <= 1) continue
      if (seen.has(match[0])) continue
      seen.add(match[0])
      hits.push({ line: i + 1, value: match[0] })
    }
  }
  return hits
}

function hasColourTokens(entries) {
  return entries.some(({ file, text }) => {
    if (/--[\w-]+\s*:\s*(?:#|rgba?\(|hsla?\(|oklch\(|color\()/.test(text)) return true
    return /colors?\s*:\s*\{/.test(text) && /tailwind\.config|(^|\/)theme\b|tokens?/i.test(file)
  })
}

function hasSpacingTokens(entries, tailwind) {
  if (tailwind) return true
  return entries.some(({ text }) => /--(?:spacing|space|gap)[\w-]*\s*:/.test(text) || /spacing\s*:\s*\{/.test(text))
}

function stemKey(file) {
  return componentName(file).replace(/(Old|New|Copy|V\d|\d+)$/i, '').replace(/[\s._-]+/g, '').toLowerCase()
}

function article(word) {
  return /^[aeiou]/.test(word) ? 'an' : 'a'
}

function listHits(items) {
  return items.slice(0, 6).map((item) => `${item.file}:${item.line}  ${item.value}`).join('\n')
}

/**
 * Raw colours and spacing inside UI files when the project already has tokens,
 * and components whose names and variant props say they are the same control.
 */
export function driftFindings(project, stack) {
  const entries = project.matching(TOKEN_FILE).filter((file) => !SKIP.test(file)).map((file) => ({ file, text: project.text(file) || '' })).filter((entry) => entry.text)
  const ui = project.matching(UI).filter((file) => !SKIP.test(file)).map((file) => ({ file, text: project.text(file) || '' })).filter((entry) => entry.text)
  const findings = []
  const colourTokens = hasColourTokens([...entries, ...ui])
  const spacingTokens = hasSpacingTokens([...entries, ...ui], Boolean(stack?.tailwind))

  if (colourTokens) {
    const colours = ui.flatMap((entry) => colourHits(entry.text).map((hit) => ({ ...hit, file: entry.file })))
    const unique = [...new Set(colours.map((hit) => hit.value))]
    if (colours.length && colours.length < 25 && unique.length < 15) {
      const sample = unique.slice(0, 3).join(', ')
      findings.push({
        id: 'design.colours-outside-tokens',
        file: colours[0].file,
        line: colours[0].line,
        what: colours.length === 1 ? `A component types a colour by hand (${sample}), even though colour tokens exist.` : `Components type colours by hand in ${colours.length} places, even though colour tokens exist (for example ${sample}).`,
        why: 'The palette was set up so a colour change happens in one place. Typed colours ignore it, so screens drift apart and the next person often rebuilds the components instead of reviewing them.',
        fix: stack?.tailwind ? 'Replace each typed colour with its token (text-brand, bg-brand, or var(--brand)).' : 'Replace each typed colour with its token, for example var(--brand).',
        evidence: listHits(colours),
        evidenceKey: 'colours-outside-tokens',
      })
    }
  }

  if (spacingTokens) {
    const spacing = ui.flatMap((entry) => spacingHits(entry.text).map((hit) => ({ ...hit, file: entry.file })))
    if (spacing.length) {
      const sample = [...new Set(spacing.map((hit) => hit.value))].slice(0, 3).join(', ')
      findings.push({
        id: 'design.spacing-outside-tokens',
        file: spacing[0].file,
        line: spacing[0].line,
        what: spacing.length === 1 ? `A component uses a one-off pixel spacing (${sample}), even though a spacing scale exists.` : `Components use one-off pixel spacing in ${spacing.length} places, even though a spacing scale exists (for example ${sample}).`,
        why: 'Spacing was meant to come from the scale, so screens line up. A typed pixel value misses the next change to that scale, and is a sign the layout was copied from a mock-up instead of built from the system.',
        fix: 'Use the scale instead (p-4, gap-6, or var(--spacing-4)). Leave 1px hairlines and borders as they are.',
        evidence: listHits(spacing),
        evidenceKey: 'spacing-outside-tokens',
      })
    }
  }

  const byRole = new Map()
  for (const entry of ui) {
    const role = componentRole(entry.file)
    if (!role) continue
    const props = variantPropsIn(entry.text, componentName(entry.file))
    const group = byRole.get(role) || []
    group.push({ file: entry.file, props, stem: stemKey(entry.file) })
    byRole.set(role, group)
  }
  for (const [role, group] of byRole) {
    const shared = VARIANT_PROPS.filter((prop) => group.filter((item) => item.props.includes(prop)).length >= 2)
    if (!shared.length) continue
    const involved = group.filter((item) => shared.some((prop) => item.props.includes(prop)))
    if (new Set(involved.map((item) => item.stem)).size < 2) continue
    const names = involved.map((item) => componentName(item.file))
    const shown = names.slice(0, 4).join(', ')
    findings.push({
      id: 'design.overlapping-components',
      file: involved[0].file,
      what: involved.length === 2 ? `${names[0]} and ${names[1]} both act as ${article(role)} ${role}, and both have a ${shared.join(' and ')} setting.` : `${involved.length} components act as ${article(role)} ${role} and share a ${shared.join(' and ')} setting: ${shown}.`,
      why: 'This usually means the control was rebuilt instead of reused. Each copy drifts, and an engineer often rewrites them into one rather than reviewing the screen.',
      fix: `Keep one ${role}, use its ${shared[0]} setting for the differences, and point the other screens at it.`,
      evidence: involved.slice(0, 6).map((item) => item.file).join('\n'),
      evidenceKey: `overlap-${role}`,
    })
  }
  return findings
}

