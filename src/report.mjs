import fs from 'node:fs'
import path from 'node:path'
import { loadFindings, loadProgress, stateDir, summarize, verdict } from './findings.mjs'

const PHASE_NAMES = {
  safety: 'Safety net',
  map: 'What the project is',
  health: 'Does it build and run',
  leftovers: 'Leftovers and duplicates',
  standards: 'Accessibility and good practice',
  security: 'Security and privacy',
  devices: 'Phones and browsers',
  performance: 'Speed and search',
  states: 'Empty, loading and error screens',
  docs: 'Notes for the next person',
  fixes: 'Fixes made',
}

const VERDICT_TEXT = {
  'NO-SHIP': 'Not ready to share yet. At least one problem could expose data, lose money or break the site for many people.',
  'PASS WITH RISKS': 'Ready to share with care. Nothing is blocking, but there are problems worth fixing soon.',
  PASS: 'Ready to share. Nothing serious was found by the automatic checks. Do the phone check below before you announce it.',
}

const GLOSSARY = [
  ['P0 / P1 / P2', 'How urgent a problem is. P0 means fix before sharing, P1 means fix soon, and P2 means tidy up when you can.'],
  ['Verified', 'The tool proved it (for example, a build failed or a key was found). Needs a human: likely, but someone should look. Human only: a computer cannot judge it.'],
  ['Build', 'Turning your project files into the finished site that gets published. If the build fails, nothing can be published.'],
  ['Lint', 'An automatic proofreader for code that catches mistakes and inconsistent style.'],
  ['Dependency / package', 'Code written by other people that your project downloads and uses.'],
  ['Lockfile', 'A list of the exact versions of every package, so everyone gets the same ones.'],
  ['Vulnerability (CVE / GHSA)', 'A publicly known security hole in a package, with an ID you can look up.'],
  ['Secret / API key', 'A password that lets code use a paid or private service. It must never be visible in the browser.'],
  ['Baseline', 'A label from the W3C web-features project. "Widely available" means a web feature works in all major browsers for at least 2.5 years.'],
  ['Accessibility (a11y)', 'Making the site usable by people using screen readers, keyboards, zoom or other assistive tools.'],
]

function where(f) {
  const bits = []
  if (f.screens?.length > 1) bits.push(`${f.screens.length} screens (${f.screens.slice(0, 4).join(', ')}${f.screens.length > 4 ? '…' : ''})`)
  else if (f.screen) bits.push(`screen ${f.screen}`)
  if (f.file) bits.push(`\`${f.file}${f.line ? `:${f.line}` : ''}\``)
  return bits.join(', ')
}

function card(f) {
  const lines = [`#### ${f.what}`, '', `**Why it matters:** ${f.why}`, '']
  if (f.fix) lines.push(`**How to fix:** ${f.fix}`, '')
  const meta = [f.effort && `About ${f.effort}`, where(f) && `Where: ${where(f)}`, f.confidence !== 'verified' && (f.confidence === 'human-only' ? 'Needs your judgement' : 'Worth a human look'), f.status !== 'open' && `Status: ${f.status}${f.note ? ` (${f.note})` : ''}`].filter(Boolean)
  if (meta.length) lines.push(`<sub>${meta.join(' · ')} · id \`${f.key}\`</sub>`, '')
  if (f.evidence) lines.push('<details><summary>Details for developers</summary>', '', '```', f.evidence, '```', '', '</details>', '')
  return lines.join('\n')
}

function section(title, intro, items) {
  if (!items.length) return ''
  return [`### ${title} (${items.length})`, '', intro, '', ...items.map(card)].join('\n')
}

const PHONE_SCRIPT = [
  'Open the site on a real iPhone (Safari) and a real Android phone (Chrome).',
  'On each main screen, scroll to the bottom: is anything cut off or hidden behind the browser bars or home indicator?',
  'Tap into every form field: does the page zoom in by itself? Does the keyboard cover the field or the submit button?',
  'Rotate the phone to landscape and back: does the layout recover?',
  'Turn on Low Power Mode (iPhone) and reload: do videos and animations still make sense?',
  'Turn on "Reduce motion" and larger text in the phone settings: is everything still readable and usable?',
  'Go offline (airplane mode) and try an action: do you see a helpful message, or nothing?',
  'Share a link to the site in a chat app: does a preview card with an image appear?',
]

/** Build the designer-first report. Plain language first, technical detail tucked away. */
export function buildReport(root) {
  const doc = loadFindings(root)
  const progress = loadProgress(root)
  const live = doc.findings.filter((f) => f.status !== 'fixed')
  const fixed = doc.findings.filter((f) => f.status === 'fixed')
  const v = verdict(doc.findings)
  const s = summarize(doc.findings)
  const stack = progress.stack || {}
  const name = path.basename(root)
  const bySeverity = (sev) => live.filter((f) => f.severity === sev && f.status !== 'accepted-risk' && f.confidence !== 'human-only')
  const human = live.filter((f) => f.confidence === 'human-only' && f.status !== 'accepted-risk')
  const accepted = live.filter((f) => f.status === 'accepted-risk')

  const out = [
    `# Designer Preflight report: ${name}`,
    '',
    `**${v.verdict}.** ${VERDICT_TEXT[v.verdict]}`,
    '',
    `${s.bySeverity.P0} to fix before sharing · ${s.bySeverity.P1} to fix soon · ${s.bySeverity.P2} to tidy up${fixed.length ? ` · ${fixed.length} already fixed` : ''}`,
    '',
    `<sub>Checked ${progress.lastScan?.at ? new Date(progress.lastScan.at).toLocaleString('en-GB') : 'not yet'}. Built with ${stack.framework || 'unknown'}${stack.tailwind ? `, Tailwind ${stack.tailwind}` : ''}${stack.typescript ? ', TypeScript' : ''}${stack.backends?.length ? `, ${stack.backends.join(', ')}` : ''}.</sub>`,
    '',
    '## How to read this',
    '',
    'Each problem says what is wrong, why it matters to the people using your site, and how to fix it. Start at the top. You can ask your AI agent to "fix the pre-flight findings"; it will ask before it changes anything. If you decide a problem does not matter, tell the agent to accept the risk and it will stop flagging it.',
    '',
    '## What needs doing',
    '',
    section('Fix before you share', 'These can expose data, cost money, or break the site for many people.', bySeverity('P0')),
    section('Fix soon', 'These affect real people, such as phone users, keyboard users or search, but will not cause a disaster.', bySeverity('P1')),
    section('Tidy up when you can', 'Small things that make the project easier to work on, or the site a little better.', bySeverity('P2')),
    section('Needs your judgement', 'A computer cannot decide these. They are about your content, your users or your business.', human),
    section('Risks you accepted', 'You decided these are fine for now.', accepted),
  ]
  if (!live.length) out.push('Nothing was found. Good work.', '')

  const groups = Object.entries(s.byPhase).sort((a, b) => b[1] - a[1])
  if (groups.length) {
    out.push('## By area', '', ...groups.map(([phase, n]) => `- ${PHASE_NAMES[phase] || phase}: ${n}`), '')
  }
  if (fixed.length) out.push('## Already fixed', '', ...fixed.map((f) => `- ${f.what}`), '')

  out.push('## What was not checked', '', 'Automatic checks cannot see everything. These were skipped or are limited:', '')
  for (const item of progress.notChecked || []) out.push(`- ${item}`)
  out.push('- Whether the site does what your users need, and whether the words are right. Only people can judge that.', '')

  out.push('## Ten-minute phone check', '', 'Emulated phones in a desktop browser miss real-device problems. Before you announce the site:', '', ...PHONE_SCRIPT.map((step, i) => `${i + 1}. ${step}`), '')
  out.push('## Words used here', '', ...GLOSSARY.map(([term, text]) => `- **${term}:** ${text}`), '')
  out.push(
    '## For developers',
    '',
    'Machine-readable results are in `.preflight/findings.json` (schema: [findings.schema.json](https://github.com/noellyonsgit/designer-preflight/blob/main/schema/findings.schema.json)). Each finding has a stable `key`. Use `preflight mark <key> --status approved|accepted-risk` to record decisions and `preflight scan` to re-check.',
    '',
    '## Built with',
    '',
    'This report uses data and tools from other people: the GitHub Advisory Database (via npm audit), OSV.dev, the npm registry, W3C WebDX web-features (Apache-2.0) and MDN browser-compat-data (CC0), axe-core by Deque (MPL-2.0), Puppeteer (Apache-2.0) and pixelmatch by Mapbox (ISC). The checks were shaped by open-source agent skills and checklists; see [CREDITS.md in Designer Preflight](https://github.com/noellyonsgit/designer-preflight/blob/main/CREDITS.md) for the full list.',
    '',
  )
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

export function writeReport(root) {
  const file = path.join(stateDir(root), 'report.md')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, buildReport(root))
  return file
}
