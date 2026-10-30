import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export const PHASES = ['safety', 'map', 'health', 'leftovers', 'standards', 'security', 'devices', 'performance', 'states', 'docs', 'fixes']
const SEVERITIES = ['P0', 'P1', 'P2']
const CONFIDENCE = ['verified', 'needs-human', 'human-only']
const STATUSES = ['open', 'approved', 'fixed', 'accepted-risk']
const EFFORTS = ['5 min', '30 min', 'half a day', '1 day+']

export function stateDir(root) {
  return path.join(root, '.preflight')
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n')
  fs.renameSync(tmp, file)
}

/** Screenshots are large and machine-specific; findings and approvals are worth committing. */
function ensureIgnore(root) {
  const file = path.join(stateDir(root), '.gitignore')
  if (!fs.existsSync(file)) {
    fs.mkdirSync(stateDir(root), { recursive: true })
    fs.writeFileSync(file, 'baseline/\ncurrent/\ndiff/\nlogs/\n')
  }
}

export function fingerprint(finding) {
  const basis = [finding.id, finding.file || '', finding.screen || '', finding.evidenceKey || finding.line || ''].join('|')
  return crypto.createHash('sha1').update(basis).digest('hex').slice(0, 12)
}

/** "1 screen(s)" → "1 screen", "3 screen(s)" → "3 screens", using the nearest number earlier in the same sentence. */
export function plural(text) {
  return text.replace(/([A-Za-z]+)\(s\)/g, (_, word, offset) => {
    const clause = text.slice(0, offset).split(/[.;:!?]\s/).pop()
    const numbers = clause.match(/\d[\d,]*/g)
    return numbers && Number(numbers.at(-1).replace(/,/g, '')) === 1 ? word : `${word}s`
  })
}

export function normalize(raw, origin = 'cli') {
  const f = { ...raw }
  if (!f.id || !f.what || !f.why) throw new Error(`A finding needs id, what and why: ${JSON.stringify(raw).slice(0, 200)}`)
  f.what = plural(f.what)
  f.why = plural(f.why)
  if (!PHASES.includes(f.phase)) throw new Error(`Unknown phase "${f.phase}" on ${f.id}`)
  if (!SEVERITIES.includes(f.severity)) throw new Error(`Unknown severity "${f.severity}" on ${f.id}`)
  f.confidence = CONFIDENCE.includes(f.confidence) ? f.confidence : 'needs-human'
  f.status = STATUSES.includes(f.status) ? f.status : 'open'
  if (f.effort && !EFFORTS.includes(f.effort)) delete f.effort
  if (f.line != null) f.line = Math.max(1, Number(f.line) || 1)
  f.origin = f.origin || origin
  f.key = f.key || fingerprint(f)
  delete f.evidenceKey
  if (f.evidence) f.evidence = String(f.evidence).slice(0, 600)
  return f
}

export function loadFindings(root) {
  return readJson(path.join(stateDir(root), 'findings.json'), { version: 1, updatedAt: null, findings: [] })
}

/**
 * Replace this run's CLI findings for the phases it covered, keeping any decision the
 * designer already made (accepted risk, approved) on findings that are still present.
 */
export function mergeFindings(root, fresh, phasesCovered, origin = 'cli') {
  ensureIgnore(root)
  const doc = loadFindings(root)
  const previous = new Map(doc.findings.map((f) => [f.key, f]))
  const covered = new Set(phasesCovered)
  const kept = doc.findings.filter((f) => f.origin !== origin || !covered.has(f.phase))
  const incoming = fresh.map((raw) => normalize(raw, origin))
  for (const f of incoming) {
    const before = previous.get(f.key)
    if (before && before.status !== 'open' && before.status !== 'fixed') {
      f.status = before.status
      if (before.note) f.note = before.note
    }
  }
  const seen = new Set()
  const findings = [...kept, ...incoming].filter((f) => (seen.has(f.key) ? false : seen.add(f.key)))
  const next = { version: 1, updatedAt: new Date().toISOString(), findings }
  writeJson(path.join(stateDir(root), 'findings.json'), next)
  return next
}

/** A fix that made a finding disappear on re-scan is recorded rather than silently dropped. */
export function markResolved(root, before, after, phasesCovered) {
  const covered = new Set(phasesCovered)
  const still = new Set(after.findings.map((f) => f.key))
  const gone = before.findings.filter((f) => f.origin === 'cli' && covered.has(f.phase) && !still.has(f.key) && f.status === 'approved')
  if (!gone.length) return after
  const doc = { ...after, findings: [...after.findings, ...gone.map((f) => ({ ...f, status: 'fixed' }))] }
  writeJson(path.join(stateDir(root), 'findings.json'), doc)
  return doc
}

export function addFinding(root, raw) {
  ensureIgnore(root)
  const doc = loadFindings(root)
  const f = normalize(raw, 'agent')
  doc.findings = doc.findings.filter((item) => item.key !== f.key).concat(f)
  doc.updatedAt = new Date().toISOString()
  writeJson(path.join(stateDir(root), 'findings.json'), doc)
  return f
}

export function setStatus(root, keys, status, note) {
  if (!STATUSES.includes(status)) throw new Error(`Status must be one of ${STATUSES.join(', ')}`)
  const doc = loadFindings(root)
  const wanted = new Set(keys)
  const changed = []
  for (const f of doc.findings) {
    if (!wanted.has(f.key) && !wanted.has(f.id)) continue
    f.status = status
    if (note) f.note = note
    changed.push(f.key)
  }
  doc.updatedAt = new Date().toISOString()
  writeJson(path.join(stateDir(root), 'findings.json'), doc)
  if (status === 'approved' || status === 'open') {
    const approvals = loadApprovals(root)
    const set = new Set(approvals.approved)
    for (const key of changed) status === 'approved' ? set.add(key) : set.delete(key)
    saveApprovals(root, { ...approvals, approved: [...set] })
  }
  return changed
}

export function loadApprovals(root) {
  return readJson(path.join(stateDir(root), 'approvals.json'), { version: 1, approved: [], updatedAt: null })
}

export function saveApprovals(root, approvals) {
  writeJson(path.join(stateDir(root), 'approvals.json'), { version: 1, ...approvals, updatedAt: new Date().toISOString() })
}

export function loadProgress(root) {
  return readJson(path.join(stateDir(root), 'progress.json'), { version: 1, phases: {}, capabilities: {}, notChecked: [] })
}

export function saveProgress(root, patch) {
  ensureIgnore(root)
  const progress = loadProgress(root)
  const next = {
    ...progress,
    ...patch,
    phases: { ...progress.phases, ...(patch.phases || {}) },
    updatedAt: new Date().toISOString(),
  }
  writeJson(path.join(stateDir(root), 'progress.json'), next)
  return next
}

export function verdict(findings) {
  const live = findings.filter((f) => f.status !== 'fixed')
  const blocking = live.filter((f) => f.severity === 'P0' && f.status !== 'accepted-risk')
  const risks = live.filter((f) => (f.severity === 'P1' && f.status !== 'accepted-risk') || (f.status === 'accepted-risk' && f.severity !== 'P2'))
  if (blocking.length) return { verdict: 'NO-SHIP', blocking, risks }
  if (risks.length) return { verdict: 'PASS WITH RISKS', blocking, risks }
  return { verdict: 'PASS', blocking, risks }
}

export function summarize(findings) {
  const out = { total: 0, open: 0, bySeverity: { P0: 0, P1: 0, P2: 0 }, byPhase: {}, byScreen: {} }
  for (const f of findings) {
    out.total++
    if (f.status === 'fixed') continue
    if (f.status === 'open') out.open++
    out.bySeverity[f.severity]++
    out.byPhase[f.phase] = (out.byPhase[f.phase] || 0) + 1
    if (f.screen) out.byScreen[f.screen] = (out.byScreen[f.screen] || 0) + 1
  }
  return out
}
