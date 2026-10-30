import path from 'node:path'
import { detectCapabilities, detectStack, describe } from './detect.mjs'
import { Project } from './files.mjs'
import { loadFindings, markResolved, mergeFindings, saveProgress } from './findings.mjs'
import * as build from './checks/build.mjs'
import * as deps from './checks/deps.mjs'
import * as secrets from './checks/secrets.mjs'
import * as cruft from './checks/cruft.mjs'
import * as design from './checks/design.mjs'
import * as markup from './checks/markup.mjs'
import * as compat from './checks/compat.mjs'

/** Order matters: build runs first so secrets can scan its output. */
export const STATIC_CHECKS = [build, deps, secrets, cruft, design, markup, compat]

/** Browser finding → the source-code finding it confirms. The pair becomes one finding with both file and screens. */
const SAME_PROBLEM = {
  'a11y.meta-viewport': 'markup.zoom-blocked',
  'a11y.image-alt': 'markup.img-no-alt',
  'a11y.html-has-lang': 'markup.no-lang',
  'runtime.input-zoom': 'markup.input-zoom',
  'runtime.no-h1': 'a11y.page-has-heading-one',
}

function mergeDuplicates(findings) {
  const byId = new Map(findings.map((f) => [f.id, f]))
  const drop = new Set()
  for (const [browserId, sourceId] of Object.entries(SAME_PROBLEM)) {
    const seen = byId.get(browserId)
    const coded = byId.get(sourceId)
    if (!seen || !coded) continue
    seen.file = seen.file || coded.file
    seen.line = seen.line || coded.line
    seen.evidence = [seen.evidence, coded.evidence].filter(Boolean).join('\n')
    if (coded.severity < seen.severity) seen.severity = coded.severity
    drop.add(coded)
  }
  return findings.filter((f) => !drop.has(f))
}

/**
 * Run every automatic check and save the results to .preflight/findings.json.
 * Options: network, build, runtime (booleans, default true), url, routes, routesFrom, only (phase list), log.
 */
export async function scan(rootArg, options = {}) {
  const root = path.resolve(rootArg || '.')
  const opts = { network: true, build: true, runtime: true, ...options }
  const log = opts.log || (() => {})
  const stack = detectStack(root)
  const caps = detectCapabilities()
  const ctx = { root, project: new Project(root), stack, caps, options: opts, notChecked: [], log }
  const only = opts.only?.length ? new Set(opts.only) : null
  const wanted = (check) => !only || check.phases.some((p) => only.has(p))

  const before = loadFindings(root)
  const findings = []
  const covered = new Set()
  const timings = {}

  const checks = [...STATIC_CHECKS]
  if (opts.runtime) {
    if (caps.chrome) checks.push(await import('./checks/runtime.mjs'))
    else ctx.notChecked.push('Pages in a real browser: Chrome, Chromium or Edge was not found, so screens were not opened, measured or tested for accessibility. Install Chrome and run again.')
  } else {
    ctx.notChecked.push('Pages in a real browser: skipped (--no-runtime).')
  }

  for (const check of checks) {
    if (!wanted(check)) continue
    const started = Date.now()
    log(`Checking ${check.name}…`)
    try {
      const found = await check.run(ctx)
      findings.push(...found)
      check.phases.forEach((p) => covered.add(p))
    } catch (err) {
      ctx.notChecked.push(`${check.name}: the check crashed (${String(err.message || err).slice(0, 200)}). Its results are missing from this run.`)
    }
    timings[check.name] = Date.now() - started
  }

  const phases = [...covered].filter((p) => !only || only.has(p))
  const kept = mergeDuplicates(findings).filter((f) => phases.includes(f.phase))
  const merged = markResolved(root, before, mergeFindings(root, kept, phases), phases)
  const progress = saveProgress(root, {
    stack: describe(stack, root),
    capabilities: caps,
    notChecked: ctx.notChecked,
    lastScan: { at: new Date().toISOString(), phases, timings, options: { network: opts.network, build: opts.build, runtime: opts.runtime, url: opts.url || null } },
    phases: Object.fromEntries(phases.map((p) => [p, { status: 'scanned', at: new Date().toISOString() }])),
  })
  return { root, stack, findings: merged.findings, progress }
}
