import fs from 'node:fs'
import path from 'node:path'
import { fetchJson, mapLimit, run as exec } from '../util.mjs'

export const name = 'deps'
export const phases = ['security', 'leftovers']

const SEVERITY = { critical: 'P0', high: 'P1', moderate: 'P2', medium: 'P2', low: 'P2', info: 'P2' }

/** Libraries that do the same job. Two from one group usually means an earlier build pass was never cleaned up. */
const SAME_JOB = {
  'date handling': ['moment', 'dayjs', 'date-fns', 'luxon'],
  'HTTP requests': ['axios', 'ky', 'got', 'node-fetch', 'superagent', 'cross-fetch'],
  'app state': ['redux', '@reduxjs/toolkit', 'zustand', 'jotai', 'recoil', 'mobx', 'valtio'],
  icons: ['react-icons', 'lucide-react', '@heroicons/react', '@fortawesome/react-fontawesome', '@phosphor-icons/react', '@tabler/icons-react', '@radix-ui/react-icons'],
  animation: ['framer-motion', 'motion', 'gsap', 'react-spring', '@react-spring/web', 'animejs'],
  'component kits': ['@mui/material', 'antd', '@chakra-ui/react', '@mantine/core', 'react-bootstrap', 'semantic-ui-react'],
  'toast messages': ['react-hot-toast', 'sonner', 'react-toastify', 'notistack'],
  forms: ['formik', 'react-hook-form', 'react-final-form'],
  validation: ['zod', 'yup', 'joi', 'valibot', 'superstruct'],
  charts: ['recharts', 'chart.js', 'react-chartjs-2', 'victory', '@nivo/core', 'apexcharts', 'echarts'],
  'CSS-in-JS': ['styled-components', '@emotion/react', '@emotion/styled', '@stitches/react'],
  'data fetching': ['@tanstack/react-query', 'swr', 'react-query'],
  'carousels': ['swiper', 'embla-carousel-react', 'react-slick', 'keen-slider'],
}

/** Tools that are used by config or the command line rather than imported. */
const IMPLICIT = /^(typescript|@types\/.*|eslint.*|@eslint\/.*|@typescript-eslint\/.*|prettier.*|@biomejs\/.*|postcss.*|autoprefixer|tailwindcss|@tailwindcss\/.*|vite|@vitejs\/.*|next|react-dom|sass|husky|lint-staged|vitest|jest|@testing-library\/.*|playwright|@playwright\/test|cross-env|concurrently|npm-run-all2?|rimraf|nodemon|ts-node|tsx|serve|react-scripts|wrangler|vercel|netlify-cli|supabase|prisma|drizzle-kit|@vercel\/.*|turbo|@next\/.*|babel.*|@babel\/.*|webpack.*|.*-loader|@sveltejs\/.*|svelte-check|astro|@astrojs\/.*|nuxt|@nuxt\/.*|vue-tsc|eslint-config-.*|eslint-plugin-.*|stylelint.*|@commitlint\/.*|knip|depcheck|happy-dom|jsdom|msw|sharp|@storybook\/.*|storybook)$/

function lockPackages(root, stack) {
  const read = (f) => {
    try {
      return fs.readFileSync(path.join(root, f), 'utf8')
    } catch {
      return null
    }
  }
  const out = new Map()
  const add = (name, version) => {
    if (name && /^\d+\.\d+\.\d+/.test(version || '')) out.set(`${name}@${version}`, { name, version: version.match(/^[^(_\s]+/)[0] })
  }
  const npm = read('package-lock.json') || read('npm-shrinkwrap.json')
  if (npm) {
    try {
      const lock = JSON.parse(npm)
      for (const [key, value] of Object.entries(lock.packages || {})) {
        if (!key || value.link) continue
        add(value.name || key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length), value.version)
      }
      for (const [key, value] of Object.entries(lock.dependencies || {})) add(key, value.version)
    } catch {
      /* unreadable lockfile */
    }
  }
  const pnpm = read('pnpm-lock.yaml')
  if (pnpm) {
    for (const m of pnpm.matchAll(/^ {2}'?\/?((?:@[^/@\s]+\/)?[^@\s'/]+)@(\d[^:'(\s]*)/gm)) add(m[1], m[2])
  }
  const yarn = read('yarn.lock')
  if (yarn) {
    for (const m of yarn.matchAll(/^"?((?:@[^/@\s]+\/)?[^@\s",]+)@[^\n]*\n\s+version:? "?([^"\n]+)"?/gm)) add(m[1], m[2])
  }
  const bun = read('bun.lock')
  if (bun) {
    for (const m of bun.matchAll(/\["((?:@[^/@\s"]+\/)?[^@\s"]+)@(\d[^"]*)"/g)) add(m[1], m[2])
  }
  if (!out.size && stack.installed) {
    for (const name of Object.keys(stack.deps)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(root, 'node_modules', name, 'package.json'), 'utf8'))
        add(name, pkg.version)
      } catch {
        /* not installed */
      }
    }
  }
  if (!out.size) {
    for (const [name, range] of Object.entries(stack.deps)) if (/^\d+\.\d+\.\d+$/.test(range)) add(name, range)
  }
  return [...out.values()]
}

async function npmAudit(ctx) {
  const { root, stack } = ctx
  if (!stack.lockfiles.some((f) => f === 'package-lock.json' || f === 'npm-shrinkwrap.json')) return null
  let last
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await exec('npm', ['audit', '--json', '--package-lock-only'], { cwd: root, timeoutMs: 120_000 })
      const start = res.out.indexOf('{')
      if (start < 0) throw new Error('npm audit returned nothing. The advisory database may have been unreachable.')
      const data = JSON.parse(res.out.slice(start))
      if (data.error) throw new Error(data.error.summary || data.error.message || 'npm audit could not reach the advisory database')
      return data
    } catch (err) {
      last = err
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)))
    }
  }
  throw last
}

function auditUnavailable(err) {
  return {
    id: 'deps.audit-unavailable',
    phase: 'security',
    severity: 'P1',
    confidence: 'verified',
    file: 'package.json',
    what: 'Packages could not be checked for known security problems.',
    why: 'The vulnerability database could not be reached, so a serious hole in a package would not appear here. "Ready to share" is incomplete until this check succeeds.',
    fix: 'Run the check again when you are online. Nothing in the project needs to change for this one.',
    effort: '5 min',
    evidence: String(err?.message || err).slice(0, 300),
    evidenceKey: 'audit-unavailable',
    source: ['npm audit', 'GitHub Advisory Database (CC-BY-4.0)', 'OSV.dev'],
  }
}

function auditFindings(data, stack) {
  const findings = []
  for (const [pkgName, v] of Object.entries(data.vulnerabilities || {})) {
    const advisories = (v.via || []).filter((x) => typeof x === 'object')
    if (!advisories.length) continue
    const titles = [...new Set(advisories.map((a) => a.title))].slice(0, 3)
    const urls = [...new Set(advisories.map((a) => a.url).filter(Boolean))].slice(0, 3)
    const devOnly = Boolean(stack.pkg.devDependencies?.[pkgName]) && !stack.pkg.dependencies?.[pkgName]
    const fix = v.fixAvailable === true
      ? 'Run `npm audit fix` (never with `--force`, which can install breaking major versions), then re-run the build and tests.'
      : v.fixAvailable && typeof v.fixAvailable === 'object'
        ? v.fixAvailable.isSemVerMajor
          ? `Updating ${v.fixAvailable.name} to ${v.fixAvailable.version} fixes it, but it is a major version change that can break things. Do it as its own step and check every screen afterwards.`
          : `Update ${v.fixAvailable.name} to ${v.fixAvailable.version}, then re-run the build and tests.`
        : 'No fixed version is published yet. Check whether your app actually uses the affected feature; if it does, consider replacing the package.'
    findings.push({
      id: 'deps.vulnerable',
      phase: 'security',
      severity: SEVERITY[v.severity] || 'P2',
      confidence: 'verified',
      file: 'package.json',
      what: `The package ${pkgName} has a known ${v.severity === 'moderate' ? 'medium' : v.severity}-risk security problem${v.isDirect ? '' : ' (it comes in through another package)'}.`,
      why: devOnly
        ? 'This package is only used while building, so visitors are not directly exposed, but a compromised build tool can still tamper with what you publish.'
        : 'Attackers search for sites using packages with published vulnerabilities, because the instructions to exploit them are public.',
      fix,
      effort: v.fixAvailable && v.fixAvailable.isSemVerMajor ? 'half a day' : '5 min',
      evidence: [...titles, ...urls].join('\n'),
      evidenceKey: pkgName,
      source: ['npm audit', 'GitHub Advisory Database (CC-BY-4.0)'],
    })
  }
  return findings
}

async function osvFindings(ctx, packages) {
  const findings = []
  const chunks = []
  for (let i = 0; i < packages.length; i += 500) chunks.push(packages.slice(i, i + 500))
  const hits = new Map()
  for (const chunk of chunks) {
    const body = { queries: chunk.map((p) => ({ package: { name: p.name, ecosystem: 'npm' }, version: p.version })) }
    const data = await fetchJson('https://api.osv.dev/v1/querybatch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, 60_000)
    data.results.forEach((r, i) => {
      if (r.vulns?.length) hits.set(`${chunk[i].name}@${chunk[i].version}`, { ...chunk[i], ids: r.vulns.map((v) => v.id) })
    })
  }
  const ids = [...new Set([...hits.values()].flatMap((h) => h.ids))].slice(0, 60)
  const details = new Map()
  await mapLimit(ids, 6, async (id) => {
    try {
      details.set(id, await fetchJson(`https://api.osv.dev/v1/vulns/${encodeURIComponent(id)}`))
    } catch {
      /* summary only */
    }
  })
  for (const hit of hits.values()) {
    const vulns = hit.ids.map((id) => details.get(id)).filter(Boolean)
    const levels = vulns.map((v) => String(v.database_specific?.severity || '').toLowerCase()).filter(Boolean)
    const worst = ['critical', 'high', 'moderate', 'medium', 'low'].find((l) => levels.includes(l)) || 'moderate'
    const fixed = vulns.flatMap((v) => (v.affected || []).flatMap((a) => (a.ranges || []).flatMap((r) => (r.events || []).map((e) => e.fixed).filter(Boolean))))
    const direct = Boolean(ctx.stack.deps[hit.name])
    findings.push({
      id: 'deps.vulnerable',
      phase: 'security',
      severity: SEVERITY[worst],
      confidence: 'verified',
      file: 'package.json',
      what: `The package ${hit.name} ${hit.version} has ${hit.ids.length} known security problem(s)${direct ? '' : ' (it comes in through another package)'}.`,
      why: 'Attackers search for sites using packages with published vulnerabilities, because the instructions to exploit them are public.',
      fix: fixed.length ? `Upgrade ${hit.name} to ${fixed.sort().at(-1)} or later (check whether that is a major version change before upgrading), then re-run the build and tests.` : 'No fixed version is listed. Check whether your app uses the affected feature; if so, consider replacing the package.',
      effort: '30 min',
      evidence: [...vulns.map((v) => v.summary).filter(Boolean).slice(0, 3), ...hit.ids.slice(0, 5).map((id) => `https://osv.dev/vulnerability/${id}`)].join('\n'),
      evidenceKey: hit.name,
      source: ['OSV.dev'],
    })
  }
  return findings
}

/** Hallucinated or brand-new packages: an AI-suggested name an attacker may have registered. */
async function registryFindings(ctx) {
  const findings = []
  const specs = Object.entries(ctx.stack.deps).filter(([, spec]) => !/^(file:|link:|workspace:|git|github:|https?:|portal:)/.test(String(spec)))
  const privateRegistry = ['.npmrc', '.yarnrc.yml'].some((f) => {
    try {
      return /registry/.test(fs.readFileSync(path.join(ctx.root, f), 'utf8'))
    } catch {
      return false
    }
  })
  await mapLimit(specs, 8, async ([pkgName, spec]) => {
    const realName = String(spec).startsWith('npm:') ? String(spec).slice(4).replace(/@[^@]*$/, '') : pkgName
    let weekly = null
    try {
      const d = await fetchJson(`https://api.npmjs.org/downloads/point/last-week/${realName}`, {}, 15_000)
      weekly = d.downloads
    } catch (err) {
      if (err.status !== 404) return
    }
    if (weekly === null) {
      if (privateRegistry) return
      findings.push({
        id: 'deps.not-on-registry',
        phase: 'security',
        severity: 'P0',
        confidence: 'needs-human',
        file: 'package.json',
        what: `"${realName}" is listed as a dependency but does not exist on the public npm registry.`,
        why: 'AI tools sometimes invent package names. If someone later registers that name, the next install will download their code into your project. This is called slopsquatting.',
        fix: `Find where ${realName} is imported. If it is a typo or invented, remove it or replace it with the real package; if it comes from a private registry, configure that registry in .npmrc.`,
        effort: '30 min',
        evidenceKey: realName,
        source: ['npm registry', 'Socket slopsquatting research'],
      })
      return
    }
    if (weekly > 2000) return
    let doc = null
    try {
      doc = await fetchJson(`https://registry.npmjs.org/${realName.replace('/', '%2F')}`, {}, 20_000)
    } catch {
      return
    }
    const created = doc.time?.created ? new Date(doc.time.created) : null
    const ageDays = created ? Math.round((Date.now() - created) / 86_400_000) : null
    const releases = Object.keys(doc.versions || {}).length
    const latest = doc['dist-tags']?.latest
    const deprecated = latest && doc.versions?.[latest]?.deprecated
    if (deprecated) {
      findings.push({
        id: 'deps.deprecated',
        phase: 'security',
        severity: 'P2',
        confidence: 'verified',
        file: 'package.json',
        what: `${realName} is deprecated by its author: "${String(deprecated).slice(0, 140)}".`,
        why: 'Deprecated packages stop receiving security fixes.',
        fix: 'Follow the replacement the author suggests in the message above.',
        effort: '30 min',
        evidenceKey: realName,
        source: ['npm registry'],
      })
    }
    if ((ageDays !== null && ageDays < 120) || releases <= 2 || weekly < 50) {
      findings.push({
        id: 'deps.unproven-package',
        phase: 'security',
        severity: 'P1',
        confidence: 'needs-human',
        file: 'package.json',
        what: `${realName} is little-used (${weekly} downloads last week, ${releases} release(s)${ageDays !== null ? `, first published ${ageDays} days ago` : ''}).`,
        why: 'New or barely-used packages are where malicious look-alikes and AI-hallucinated names hide. Existing on the registry does not make a package safe.',
        fix: `Check that ${realName} is the package you meant (description: "${String(doc.description || 'none').slice(0, 100)}"), that it has a real source repository, and that a well-known alternative does not exist.`,
        effort: '5 min',
        evidenceKey: realName,
        source: ['npm registry', 'Socket slopsquatting research'],
      })
    }
  })
  return findings
}

function unusedFindings(ctx) {
  const { project, stack } = ctx
  const findings = []
  const corpus = project.list.filter((p) => p !== 'package.json' && !/lock|\.lockb$/.test(p) && /\.(m?[jt]sx?|cjs|vue|svelte|astro|html?|css|scss|json|ya?ml|toml)$/i.test(p))
  const scripts = Object.values(stack.scripts).join(' ')
  const texts = corpus.map((p) => project.text(p) || '').join('\n')
  for (const dep of Object.keys(stack.pkg?.dependencies || {})) {
    if (IMPLICIT.test(dep) || scripts.includes(dep)) continue
    const bare = dep.startsWith('@types/') ? dep.slice(7) : dep
    if (texts.includes(`'${bare}`) || texts.includes(`"${bare}`) || texts.includes(`\`${bare}`) || texts.includes(`${bare}/`)) continue
    findings.push({
      id: 'deps.unused',
      phase: 'leftovers',
      severity: 'P2',
      confidence: 'needs-human',
      file: 'package.json',
      what: `${dep} is installed but nothing in the code appears to use it.`,
      why: 'Unused packages make installs slower, can end up in what visitors download, and each one is another thing that can carry a security issue.',
      fix: `Confirm nothing loads ${dep} indirectly (plugins and config files sometimes do), then remove it with your package manager and re-run the build.`,
      effort: '5 min',
      evidenceKey: dep,
      source: ['preflight'],
    })
  }
  for (const [job, names] of Object.entries(SAME_JOB)) {
    const present = names.filter((n) => stack.deps[n])
    if (present.length < 2) continue
    findings.push({
      id: 'deps.same-job',
      phase: 'leftovers',
      severity: 'P2',
      confidence: 'needs-human',
      file: 'package.json',
      what: `${present.length} libraries do the same job (${job}): ${present.join(', ')}.`,
      why: 'This usually happens when different build passes each picked their own tool. Visitors download both, and screens end up behaving or looking slightly differently.',
      fix: `Pick one (usually the one used most), move the remaining uses over, then remove the other${present.length > 2 ? 's' : ''}.`,
      effort: 'half a day',
      evidenceKey: job,
      source: ['preflight'],
    })
  }
  return findings
}

export async function run(ctx) {
  const { stack } = ctx
  if (!stack.hasPackageJson) return []
  const findings = []
  const depCount = Object.keys(stack.deps).length
  if (depCount && !stack.lockfiles.length) {
    findings.push({
      id: 'deps.no-lockfile',
      phase: 'security',
      severity: 'P1',
      confidence: 'verified',
      file: 'package.json',
      what: 'There is no lockfile, so every install can pick up different package versions.',
      why: 'Without a lockfile, the server that builds your site may install newer versions than you tested, including a compromised release.',
      fix: `Run \`${stack.packageManager || 'npm'} install\` and commit the lockfile it creates.`,
      effort: '5 min',
      source: ['preflight'],
    })
  }
  findings.push(...unusedFindings(ctx))

  if (ctx.options.network === false) {
    ctx.notChecked.push('Known vulnerabilities and package registry checks were skipped (--no-network).')
    return findings
  }
  let audited = false
  let auditError = null
  try {
    const audit = await npmAudit(ctx)
    if (audit) {
      findings.push(...auditFindings(audit, stack))
      audited = true
    }
  } catch (err) {
    auditError = err
    ctx.log(`npm audit failed: ${err.message}`)
  }
  if (!audited) {
    const packages = lockPackages(ctx.root, stack)
    if (packages.length) {
      try {
        findings.push(...(await osvFindings(ctx, packages)))
        ctx.log(`OSV checked ${packages.length} packages`)
      } catch (err) {
        findings.push(auditUnavailable(auditError || err))
      }
    } else if (auditError) {
      findings.push(auditUnavailable(auditError))
    } else {
      ctx.notChecked.push('Known vulnerabilities: no lockfile or installed packages to check.')
    }
  }
  try {
    findings.push(...(await registryFindings(ctx)))
  } catch (err) {
    ctx.notChecked.push(`Package registry checks failed: ${err.message}`)
  }
  return findings
}
