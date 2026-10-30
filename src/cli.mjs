#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { detectCapabilities, detectStack, describe } from './detect.mjs'
import { addFinding, loadFindings, loadProgress, plural, summarize, setStatus, verdict, PHASES } from './findings.mjs'
import { writeReport } from './report.mjs'
import { scan } from './scan.mjs'

const HELP = `Designer Preflight: checks a vibe-coded project before you share it.

Usage: preflight <command> [project folder] [options]

Commands
  scan       Run every automatic check and save the results
  report     Write a plain-language report to .preflight/report.md
  status     Show the verdict and counts from the last scan
  verdict    Print PASS, PASS WITH RISKS or NO-SHIP (exit code 2 for NO-SHIP)
  baseline   Save screenshots of every screen to compare against later
  compare    Take new screenshots and highlight what changed since the baseline
  mark       Record a decision: preflight mark <key...> --status approved|accepted-risk|open|fixed [--note "…"]
  add        Add a finding found by an agent: preflight add --finding '<json>' (or pipe JSON in)
  doctor     Show which optional tools are available on this computer

Options
  --json               Machine-readable output on stdout (for agents and FlowMap); progress still goes to stderr
  --quiet              No progress messages
  --url <url>          Check a site that is already running (or live) instead of starting one
  --routes a,b,c       Only check these screens
  --routes-from flowmap  Ask FlowMap for the list of screens
  --only <phases>      Only run some phases (${PHASES.join(', ')})
  --no-build           Skip install, type, lint, build and test commands
  --no-network         Do not contact OSV.dev or the npm registry
  --no-runtime         Do not open pages in Chrome
  --project <folder>   Project folder for mark and add (default: current folder)
`

function parse(argv) {
  const args = { _: [], flags: {} }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--no-')) args.flags[a.slice(5)] = false
    else if (a.startsWith('--')) {
      const [k, inline] = a.slice(2).split('=')
      const boolean = ['json', 'help', 'quiet'].includes(k)
      args.flags[k] = inline ?? (boolean ? true : argv[++i])
    } else args._.push(a)
  }
  return args
}

function out(json, data, text) {
  if (json) process.stdout.write(JSON.stringify(data, null, 2) + '\n')
  else process.stdout.write(plural(text) + '\n')
}

function readStdin() {
  if (process.stdin.isTTY) return ''
  try {
    return fs.readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}

function list(value) {
  return value ? String(value).split(',').map((s) => s.trim()).filter(Boolean) : undefined
}

function statusText(root, findings) {
  const v = verdict(findings)
  const s = summarize(findings)
  const lines = [`${v.verdict}: ${s.bySeverity.P0} to fix before sharing, ${s.bySeverity.P1} to fix soon, ${s.bySeverity.P2} to tidy up.`]
  const urgent = findings.filter((x) => x.status === 'open' && x.severity !== 'P2').sort((a, b) => a.severity.localeCompare(b.severity))
  for (const f of urgent.slice(0, 15)) {
    lines.push(`  ${f.severity} ${f.what}${f.file ? `  (${f.file}${f.line ? `:${f.line}` : ''})` : ''}  [${f.key}]`)
  }
  lines.push(`Full report: preflight report ${path.relative(process.cwd(), root) || '.'}`)
  return lines.join('\n')
}

async function main() {
  const { _: [command = 'help', ...rest], flags } = parse(process.argv.slice(2))
  const json = Boolean(flags.json)
  if (command === 'help' || flags.help) return out(false, null, HELP)

  if (command === 'doctor') {
    const caps = detectCapabilities()
    const root = path.resolve(rest[0] || '.')
    const stack = fs.existsSync(root) ? describe(detectStack(root), root) : null
    return out(json, { capabilities: caps, stack }, [
      `Node ${caps.node}`,
      `Git: ${caps.git ? 'yes' : 'no (the safety net and redundancy checks are weaker without it)'}`,
      `Chrome: ${caps.chrome || 'not found (pages cannot be opened, measured or screenshotted)'}`,
      `FlowMap: ${caps.flowmap ? 'found' : 'not found (optional; screens are found by crawling instead)'}`,
      `gitleaks: ${caps.gitleaks || 'not installed (optional; scans git history for leaked keys)'}`,
      `osv-scanner: ${caps.osvScanner || 'not installed (optional; the OSV.dev API is used instead)'}`,
      stack && `Project: ${stack.framework}${stack.typescript ? ', TypeScript' : ''}${stack.tailwind ? `, Tailwind ${stack.tailwind}` : ''}`,
    ].filter(Boolean).join('\n'))
  }

  if (command === 'mark') {
    const root = path.resolve(flags.project || '.')
    if (!rest.length || !flags.status) throw new Error('Usage: preflight mark <key...> --status approved|accepted-risk|open|fixed [--note "…"]')
    const changed = setStatus(root, rest, flags.status, flags.note)
    return out(json, { changed }, changed.length ? `Marked ${changed.length} finding(s) as ${flags.status}.` : 'No finding matched those keys.')
  }

  if (command === 'add') {
    const root = path.resolve(flags.project || '.')
    const raw = flags.finding || readStdin()
    if (!raw) throw new Error("Usage: preflight add --finding '{\"id\":\"…\",\"phase\":\"…\",\"severity\":\"P1\",\"what\":\"…\",\"why\":\"…\"}'")
    const parsed = JSON.parse(raw)
    const added = (Array.isArray(parsed) ? parsed : [parsed]).map((f) => addFinding(root, f))
    return out(json, { added: added.map((f) => f.key) }, `Added ${added.length} finding(s).`)
  }

  const root = path.resolve(rest[0] || '.')
  if (!fs.existsSync(root)) throw new Error(`No folder at ${root}`)
  const log = flags.quiet ? () => {} : (msg) => process.stderr.write(`${plural(msg)}\n`)

  if (command === 'scan') {
    const result = await scan(root, {
      network: flags.network !== false,
      build: flags.build !== false,
      runtime: flags.runtime !== false,
      url: flags.url,
      routes: list(flags.routes),
      routesFrom: flags['routes-from'],
      only: list(flags.only),
      log,
    })
    writeReport(root)
    const v = verdict(result.findings)
    return out(json, { verdict: v.verdict, summary: summarize(result.findings), findings: result.findings, notChecked: result.progress.notChecked, stack: result.progress.stack }, statusText(root, result.findings))
  }

  if (command === 'status' || command === 'verdict') {
    const { findings } = loadFindings(root)
    const v = verdict(findings)
    if (command === 'verdict') {
      out(json, { verdict: v.verdict, blocking: v.blocking.map((f) => f.key), risks: v.risks.map((f) => f.key) }, v.verdict)
      process.exitCode = v.verdict === 'NO-SHIP' ? 2 : 0
      return
    }
    return out(json, { verdict: v.verdict, summary: summarize(findings), progress: loadProgress(root), findings }, findings.length ? statusText(root, findings) : 'No scan yet. Run: preflight scan')
  }

  if (command === 'report') {
    const file = writeReport(root)
    return out(json, { report: file }, `Report written to ${file}`)
  }

  if (command === 'baseline' || command === 'compare') {
    const { baseline, compare } = await import('./baseline.mjs')
    const opts = { url: flags.url, routes: list(flags.routes), routesFrom: flags['routes-from'], log }
    const result = command === 'baseline' ? await baseline(root, opts) : await compare(root, opts)
    return out(json, result, result.message)
  }

  throw new Error(`Unknown command "${command}". Run: preflight help`)
}

main().catch((err) => {
  process.stderr.write(`preflight: ${err.message || err}\n`)
  process.exitCode = 1
})
