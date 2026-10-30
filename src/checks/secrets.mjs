import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { excerpt, isGitRepo, isIgnored, lineOf, trackedFiles } from '../files.mjs'
import { run as exec } from '../util.mjs'

export const name = 'secrets'
export const phases = ['security']

const PATTERNS = [
  { id: 'aws-key', label: 'an Amazon Web Services access key', re: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/, severity: 'P0' },
  { id: 'google-key', label: 'a Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/, severity: 'P1', note: 'Google browser keys are meant to be public only when restricted to your domain in Google Cloud.' },
  { id: 'stripe-live', label: 'a live Stripe secret key', re: /\b(sk|rk)_live_[0-9A-Za-z]{20,}\b/, severity: 'P0' },
  { id: 'stripe-test', label: 'a Stripe test secret key', re: /\bsk_test_[0-9A-Za-z]{20,}\b/, severity: 'P1' },
  { id: 'openai-key', label: 'an OpenAI API key', re: /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}\b/, severity: 'P0' },
  { id: 'anthropic-key', label: 'an Anthropic API key', re: /\bsk-ant-[A-Za-z0-9_-]{32,}\b/, severity: 'P0' },
  { id: 'github-token', label: 'a GitHub token', re: /\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/, severity: 'P0' },
  { id: 'slack-token', label: 'a Slack token', re: /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/, severity: 'P0' },
  { id: 'private-key', label: 'a private key', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/, severity: 'P0' },
  { id: 'db-url', label: 'a database address with a password', re: /\b(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s:'"]+:[^\s@'"]{6,}@[^\s'"]+/, severity: 'P0' },
  { id: 'resend-key', label: 'a Resend email API key', re: /\bre_[A-Za-z0-9]{8}_[A-Za-z0-9]{16,}\b/, severity: 'P0' },
]
const JWT = /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g
const CLIENT_PREFIX = /\b(NEXT_PUBLIC_|VITE_|PUBLIC_|EXPO_PUBLIC_|REACT_APP_|NUXT_PUBLIC_|GATSBY_)[A-Z0-9_]*(SECRET|SERVICE_ROLE|PRIVATE|PASSWORD|ADMIN_KEY|SERVER_KEY|OPENAI|ANTHROPIC|CLAUDE|GEMINI|GROQ|MISTRAL|REPLICATE|ELEVENLABS|RESEND|SENDGRID|POSTMARK|TWILIO|STRIPE_SK)[A-Z0-9_]*/g
const PAID_API = /OPENAI|ANTHROPIC|CLAUDE|GEMINI|GROQ|MISTRAL|REPLICATE|ELEVENLABS|RESEND|SENDGRID|POSTMARK|TWILIO|STRIPE_SK/
const SKIP = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|\.preflight\/)|\.(png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|mp4|webm|pdf|zip)$/i
const BUILT = ['dist', 'build', 'out', '.next/static', '.output/public', '.svelte-kit/output/client']

function redact(value) {
  return value.length <= 8 ? '****' : `${value.slice(0, 4)}…${value.slice(-2)} (${value.length} chars)`
}

function decodeJwt(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
  } catch {
    return null
  }
}

function builtFiles(root) {
  const out = []
  for (const dir of BUILT) {
    const abs = path.join(root, dir)
    if (!fs.existsSync(abs)) continue
    const stack = [abs]
    while (stack.length && out.length < 4000) {
      const cur = stack.pop()
      for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
        const p = path.join(cur, entry.name)
        if (entry.isDirectory()) stack.push(p)
        else if (/\.(m?js|html|css|map|json)$/.test(entry.name)) out.push(path.relative(root, p))
      }
    }
  }
  return out
}

function scanText(file, text, inBundle, push) {
  for (const p of PATTERNS) {
    const re = new RegExp(p.re.source, 'g')
    for (const m of text.matchAll(re)) {
      push({
        id: `secrets.${p.id}`,
        phase: 'security',
        severity: p.severity,
        confidence: /example|placeholder|your[_-]?key|xxxx/i.test(excerpt(text, m.index, 200)) ? 'needs-human' : 'verified',
        file,
        line: lineOf(text, m.index),
        what: `${inBundle ? 'The built website that visitors download contains' : 'The code contains'} ${p.label}.`,
        why: `Anyone who finds this key can use it as you: run up bills, read data or send messages in your name. ${inBundle ? 'Because it is in the files the browser downloads, every visitor can see it.' : 'Keys in code end up on GitHub and in every copy of the project.'} ${p.note || ''}`.trim(),
        fix: 'Revoke this key in the provider\'s dashboard and create a new one. Put the new key in an environment variable that only the server can read, never in code or in a variable with a public prefix.',
        effort: '30 min',
        evidence: redact(m[0]),
        evidenceKey: `${p.id}:${m[0].slice(0, 12)}`,
        source: ['preflight', 'vibecoded-site-audit-skill (MIT)'],
      })
    }
  }
  for (const m of text.matchAll(JWT)) {
    const payload = decodeJwt(m[0])
    if (payload?.role !== 'service_role') continue
    push({
      id: 'secrets.supabase-service-role',
      phase: 'security',
      severity: 'P0',
      confidence: 'verified',
      file,
      line: lineOf(text, m.index),
      what: `${inBundle ? 'The built website contains' : 'The code contains'} the Supabase service-role key.`,
      why: 'The service-role key skips every database security rule. Anyone with it can read, change or delete all of your users\' data.',
      fix: 'Rotate the key in Supabase (Project Settings, API). Use it only in server code, such as API routes or edge functions, through a variable without a public prefix. The browser should only ever have the anon key.',
      effort: '30 min',
      evidence: redact(m[0]),
      evidenceKey: `service-role:${m[0].slice(-12)}`,
      source: ['vibecoded-site-audit-skill (MIT)'],
    })
  }
}

const TABLE = String.raw`(?:"?(\w+)"?\.)?"?(\w+)"?`

/** Supabase exposes every table in the public schema to the browser; row level security is the only lock. */
function supabaseRules(project, push) {
  const created = new Map()
  const locked = new Set()
  const open = []
  for (const file of project.list.filter((f) => f.endsWith('.sql'))) {
    const text = project.text(file) || ''
    for (const m of text.matchAll(new RegExp(String.raw`create\s+table\s+(?:if\s+not\s+exists\s+)?${TABLE}`, 'gi'))) {
      if ((m[1] || 'public').toLowerCase() === 'public' && !created.has(m[2])) created.set(m[2], { file, line: lineOf(text, m.index) })
    }
    for (const m of text.matchAll(new RegExp(String.raw`alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${TABLE}\s+enable\s+row\s+level\s+security`, 'gi'))) locked.add(m[2])
    for (const m of text.matchAll(/create\s+policy\s+"?([^"\n]+?)"?\s+on\s+(?:"?\w+"?\.)?"?(\w+)"?[^;]*?\b(?:for\s+(all|update|delete|insert))[^;]*?(?:using|with\s+check)\s*\(\s*true\s*\)/gi)) {
      open.push({ file, line: lineOf(text, m.index), table: m[2], action: m[3].toLowerCase() })
    }
  }
  const unlocked = [...created].filter(([table]) => !locked.has(table))
  if (unlocked.length) {
    const [, first] = unlocked[0]
    push({
      id: 'secrets.supabase-no-rls',
      phase: 'security',
      severity: 'P0',
      confidence: 'needs-human',
      file: first.file,
      line: first.line,
      what: `${unlocked.length === 1 ? '1 database table has' : `${unlocked.length} database tables have`} no row level security: ${unlocked.slice(0, 5).map(([t]) => t).join(', ')}${unlocked.length > 5 ? '…' : ''}.`,
      why: 'Supabase lets the browser talk to the database directly with the public anon key. Without row level security, anyone can read, change or delete every row in these tables, not just their own.',
      fix: 'For each table, add `alter table <name> enable row level security;` and a policy that only lets people see their own rows (for example `using (auth.uid() = user_id)`). Check in the Supabase dashboard too, because tables made there do not appear in these files.',
      effort: '30 min',
      evidence: unlocked.map(([t, at]) => `${t} (${at.file}:${at.line})`).join('\n'),
      evidenceKey: unlocked.map(([t]) => t).join(','),
      source: ['Supabase docs: Row Level Security', 'vibecoded-site-audit-skill (MIT)'],
    })
  }
  for (const rule of open) {
    push({
      id: 'secrets.supabase-open-policy',
      phase: 'security',
      severity: 'P1',
      confidence: 'needs-human',
      file: rule.file,
      line: rule.line,
      what: `A database rule lets anyone ${rule.action === 'all' ? 'read and change' : rule.action} rows in ${rule.table}.`,
      why: 'A policy of "true" switches row level security off for that action, so any visitor with the public key can do it to every row.',
      fix: 'Limit the rule to the row\'s owner, for example `using (auth.uid() = user_id)`, unless the table is genuinely meant to be public.',
      effort: '30 min',
      evidenceKey: `${rule.table}:${rule.action}`,
      source: ['Supabase docs: Row Level Security'],
    })
  }
}

export async function run(ctx) {
  const { root, project } = ctx
  const findings = []
  const seen = new Set()
  const push = (f) => {
    const key = `${f.id}|${f.file}|${f.line}`
    if (!seen.has(key)) {
      seen.add(key)
      findings.push(f)
    }
  }

  const tracked = trackedFiles(root)
  const localEnv = (file) => /(^|\/)\.env(\.[\w-]+)?$/.test(file) && !tracked.includes(file)
  for (const file of project.list) {
    if (SKIP.test(file) || localEnv(file)) continue
    const text = project.text(file)
    if (text) scanText(file, text, false, push)
  }
  const bundle = builtFiles(root)
  for (const file of bundle) {
    try {
      const stat = fs.statSync(path.join(root, file))
      if (stat.size > 5_000_000) continue
      scanText(file, fs.readFileSync(path.join(root, file), 'utf8'), true, push)
    } catch {
      /* unreadable */
    }
  }
  if (!bundle.length) ctx.notChecked.push('Secrets in the built website: no build output found (run the build first to include it).')

  const maps = bundle.filter((f) => f.endsWith('.map') && !f.startsWith('.next/server'))
  if (maps.length) {
    push({
      id: 'secrets.public-source-maps',
      phase: 'security',
      severity: 'P2',
      confidence: 'needs-human',
      file: maps[0],
      what: `The build publishes ${maps.length} source map file(s).`,
      why: 'Source maps let anyone read your original, readable code (including comments) from the live site. That is not dangerous on its own, but it makes finding weaknesses much easier.',
      fix: 'Turn off production source maps (Vite: build.sourcemap = false; Next.js: productionBrowserSourceMaps: false), or upload them to your error tracker instead of publishing them.',
      effort: '5 min',
      source: ['vibecoded-site-audit-skill (MIT)'],
    })
  }

  for (const file of tracked.filter((f) => /(^|\/)\.env(\.[\w-]+)?$/.test(f) && !/\.(example|sample|template)$/.test(f))) {
    const text = project.text(file) || ''
    const hasValues = /^\s*[A-Z0-9_]+\s*=\s*\S+/m.test(text)
    push({
      id: 'secrets.env-committed',
      phase: 'security',
      severity: hasValues ? 'P0' : 'P2',
      confidence: 'verified',
      file,
      what: `${file} is committed to git${hasValues ? ' with values in it' : ''}.`,
      why: 'Environment files usually hold passwords and keys. Once committed, they stay in the project history even after the file is deleted, and anyone with access to the repository can read them.',
      fix: `Rotate every key in ${file}, run \`git rm --cached ${file}\`, add .env* to .gitignore (keep a .env.example with names only), and commit.`,
      effort: '30 min',
      source: ['preflight'],
    })
  }
  for (const file of project.list.filter((f) => /(^|\/)\.env(\.local|\.production|\.development)?$/.test(f))) {
    if (!tracked.includes(file) && !isIgnored(root, file)) {
      const keys = []
      scanText(file, project.text(file) || '', false, (f) => keys.push(f))
      const live = keys.some((k) => k.severity === 'P0' && k.confidence === 'verified')
      push({
        id: 'secrets.env-not-ignored',
        phase: 'security',
        severity: live ? 'P0' : 'P1',
        confidence: 'verified',
        file,
        what: `${file} is not listed in .gitignore, so the next commit could include it${keys.length ? ` along with ${keys.length} key(s)` : ''}.`,
        why: `Keeping keys in ${file} on your own computer is correct. But one \`git add .\` would publish every key in it${live ? ', including live keys that can spend money or read customer data' : ''}.${isGitRepo(root) ? '' : ' This folder is not a git repository yet, so this matters the moment you create one.'}`,
        evidence: keys.map((k) => k.evidence).join('\n') || undefined,
        fix: 'Add `.env*` and `!.env.example` to .gitignore.',
        effort: '5 min',
        source: ['preflight'],
      })
    }
  }

  for (const hit of project.grep(/\.(m?[jt]sx?|vue|svelte|astro|env(\.\w+)?|example)$/i, CLIENT_PREFIX, { limit: 40 })) {
    push({
      id: 'secrets.public-prefix',
      phase: 'security',
      severity: 'P0',
      confidence: 'needs-human',
      file: hit.file,
      line: hit.line,
      what: `${hit.match} looks like a secret, but its prefix makes it public.`,
      why: `Variables starting with ${hit.groups[0]} are copied into the website every visitor downloads. ${PAID_API.test(hit.groups[1]) ? `A ${hit.groups[1].toLowerCase().replace(/_sk$/, '')} key there lets anyone run up bills on your account.` : `A name containing "${hit.groups[1]}" suggests it should only be known to the server.`}`,
      fix: 'Rename the variable without the public prefix and read it only in server code (API routes, server actions, edge functions). Rotate the value if it was ever deployed.',
      effort: '30 min',
      evidenceKey: hit.match,
      source: ['preflight'],
    })
  }

  supabaseRules(project, push)

  if (ctx.caps.gitleaks && ctx.caps.git) {
    const report = path.join(os.tmpdir(), `preflight-gitleaks-${process.pid}.json`)
    const res = await exec(ctx.caps.gitleaks, ['git', '--no-banner', '--report-format', 'json', '--report-path', report, '.'], { cwd: root, timeoutMs: 180_000 })
    try {
      const leaks = JSON.parse(fs.readFileSync(report, 'utf8'))
      for (const leak of leaks.slice(0, 30)) {
        push({
          id: 'secrets.history',
          phase: 'security',
          severity: 'P0',
          confidence: 'needs-human',
          file: leak.File,
          line: leak.StartLine,
          what: `A ${leak.Description || leak.RuleID} was committed in the past (commit ${String(leak.Commit).slice(0, 7)}).`,
          why: 'Deleting a secret from the code does not remove it from git history. Anyone who can see the repository can still find it.',
          fix: 'Rotate the key with the provider. Rewriting history is optional once the old key no longer works.',
          effort: '30 min',
          evidence: redact(String(leak.Secret || '')),
          evidenceKey: `${leak.Commit}:${leak.RuleID}`,
          source: ['gitleaks (MIT)'],
        })
      }
    } catch {
      ctx.log(`gitleaks produced no report (exit ${res.code})`)
    } finally {
      fs.rmSync(report, { force: true })
    }
  } else {
    ctx.notChecked.push('Secrets in git history: gitleaks is not installed (optional, https://github.com/gitleaks/gitleaks).')
  }
  return findings
}
