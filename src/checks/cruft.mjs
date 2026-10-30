import fs from 'node:fs'
import path from 'node:path'
import { CODE, MARKUP, STYLE, excerpt, trackedFiles } from '../files.mjs'

export const name = 'cruft'
export const phases = ['leftovers', 'docs']

const COPY_NAME = /(?:^|[\s._-])(old|copy|backup|bak|orig|tmp|unused|deprecated)(?:[\s._-]?\d+)?$|\s\(\d+\)$|(?:^|[\s._-])(v\d|final|test\d)$|[a-z](Old|Copy|Backup|V\d)$/
const MODULE_DIRS = /(^|\/)(components|lib|hooks|utils|helpers|services|store|stores|context|contexts|features|ui|sections|layouts|widgets|modules|shared)\//
const ENTRY = /(^|\/)(page|layout|route|loading|error|not-found|global-error|template|default|middleware|proxy|instrumentation|_app|_document|main|index|App|entry[-.]\w+|root|\+page|\+layout|\+server|\+page\.server|\+layout\.server|\+error)\.[^/]+$|(^|\/)(pages|app|routes|api|server|functions|supabase\/functions|netlify\/functions)\/|\.(config|setup)\.[^/]+$|\.(test|spec|stories)\.[^/]+$|(^|\/)(scripts|tests?|__tests__|e2e|cypress|playwright)\//
const AGENT_FILES = ['.cursorrules', 'AGENTS.md', 'CLAUDE.md', '.windsurfrules', '.clinerules', 'GEMINI.md', '.github/copilot-instructions.md']
const FRAMEWORK_WORDS = {
  'Next.js': 'next',
  Nuxt: 'nuxt',
  SvelteKit: '@sveltejs/kit',
  Astro: 'astro',
  Remix: '@remix-run/react',
  Vite: 'vite',
  Tailwind: 'tailwindcss',
  Supabase: '@supabase/supabase-js',
  Firebase: 'firebase',
  Prisma: '@prisma/client',
  Redux: '@reduxjs/toolkit',
  Zustand: 'zustand',
  'styled-components': 'styled-components',
  'Material UI': '@mui/material',
  'shadcn': '@radix-ui/react-slot',
}

function f(partial) {
  return { phase: 'leftovers', severity: 'P2', confidence: 'needs-human', effort: '5 min', source: ['preflight', 'vibe-code-cleanup (MIT)'], ...partial }
}

function stem(file) {
  return path.basename(file).replace(/\.[^.]+$/, '')
}

function resolveSpec(from, spec, files) {
  let bases
  if (spec.startsWith('.')) bases = [path.posix.normalize(path.posix.join(path.posix.dirname(from), spec))]
  else if (/^[@~#]\//.test(spec)) bases = [`src/${spec.slice(2)}`, spec.slice(2), `app/${spec.slice(2)}`]
  else if (spec.startsWith('/')) bases = [spec.slice(1)]
  else return null
  const exts = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.vue', '.svelte', '.astro', '/index.ts', '/index.tsx', '/index.js', '/index.jsx']
  for (const base of bases) for (const ext of exts) if (files.has(base + ext)) return base + ext
  return null
}

function unusedModules(ctx) {
  const { project } = ctx
  const code = project.matching(CODE)
  const files = new Set(code)
  const imported = new Set()
  const allText = []
  for (const file of project.list) {
    if (!/\.(m?[jt]sx?|cjs|vue|svelte|astro|html?|mdx?|json)$/i.test(file)) continue
    const text = project.text(file)
    if (!text) continue
    allText.push([file, text])
    if (!CODE.test(file) && !/\.html?$/.test(file)) continue
    for (const m of text.matchAll(/(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]|src=["']([^"']+\.(?:m?[jt]sx?))["']/g)) {
      const hit = resolveSpec(file, m[1] || m[2] || m[3] || m[4] || m[5], files)
      if (hit) imported.add(hit)
    }
  }
  const out = []
  for (const file of code) {
    if (!MODULE_DIRS.test(file) || ENTRY.test(file) || imported.has(file) || /\.d\.ts$/.test(file)) continue
    const name = stem(file) === 'index' ? path.basename(path.dirname(file)) : stem(file)
    const mentioned = allText.some(([other, text]) => other !== file && text.includes(name))
    if (mentioned) continue
    out.push(file)
  }
  return out
}

export async function run(ctx) {
  const { root, project, stack } = ctx
  const findings = []

  if (stack.lockfiles.length > 1) {
    findings.push(f({
      id: 'cruft.lockfiles',
      severity: 'P1',
      confidence: 'verified',
      file: stack.lockfiles[1],
      what: `There are ${stack.lockfiles.length} lockfiles (${stack.lockfiles.join(', ')}), one per package manager.`,
      why: 'Each lockfile pins different versions. Your laptop and the server that publishes the site can install different code, so a build that works for you can break or behave differently there.',
      fix: `Keep the lockfile for the package manager you use (${stack.packageManager}), delete the others, and add a "packageManager" field to package.json.`,
    }))
  }

  const assetCopies = new Map()
  for (const file of project.list) {
    const base = stem(file)
    if (!COPY_NAME.test(base) || /(^|\/)(node_modules|migrations?)\//.test(file) || /\.(md|lock)$/.test(file)) continue
    if (!CODE.test(file) && !STYLE.test(file) && !MARKUP.test(file)) {
      const dir = path.posix.dirname(file)
      assetCopies.set(dir, [...(assetCopies.get(dir) || []), file])
      continue
    }
    findings.push(f({
      id: 'cruft.copy-file',
      file,
      what: `${file} looks like a copy or an old version of another file.`,
      why: 'Old copies left by earlier build passes confuse both people and AI agents, who may edit the wrong one. If something still imports them, two versions of the same thing ship.',
      fix: 'Check whether anything uses it. If not, delete it; if it does, move the useful parts into the real file.',
    }))
  }
  for (const [dir, files] of assetCopies) {
    findings.push(f({
      id: 'cruft.copy-assets',
      confidence: 'human-only',
      file: dir === '.' ? files[0] : `${dir}/`,
      evidenceKey: dir,
      what: `${files.length} file(s) in ${dir === '.' ? 'the project root' : dir} have copy-style names, such as "${path.posix.basename(files[0])}".`,
      why: 'Names like "photo (2).jpg" usually come from downloading or duplicating a file. If they are leftovers, they make the project bigger and harder to navigate. If they are real variants, clearer names help everyone.',
      fix: 'Check whether the site uses them. Delete the leftovers, and rename the real variants (for example "poster-bold-a4.pdf" instead of "poster (2).pdf").',
      evidence: files.slice(0, 8).join('\n'),
    }))
  }
  const versioned = [...new Set(project.list.map((p) => p.match(/^(.*?\/)?(v\d+|old|legacy|backup|archive|unused)\//i)?.[0]).filter(Boolean))]
  for (const dir of versioned.slice(0, 10)) {
    findings.push(f({ id: 'cruft.versioned-folder', file: dir, what: `The folder ${dir} looks like an older generation of the project.`, why: 'Folders like this are usually left over from an earlier pass and are easy to edit by mistake.', fix: 'Confirm nothing imports from it, then delete it.', effort: '30 min', evidenceKey: dir }))
  }

  const tracked = trackedFiles(root)
  const junk = tracked.filter((p) => /(^|\/)(\.DS_Store|Thumbs\.db|npm-debug\.log.*|yarn-error\.log|.*\.log)$/.test(p) || /^(node_modules|dist|build|\.next|out|coverage|\.vercel)\//.test(p))
  if (junk.length) {
    const folders = [...new Set(junk.map((p) => p.split('/')[0]))]
    findings.push(f({
      id: 'cruft.committed-junk',
      severity: junk.some((p) => p.startsWith('node_modules/')) ? 'P1' : 'P2',
      confidence: 'verified',
      file: junk[0],
      what: `${junk.length} file(s) are committed that should not be (${folders.slice(0, 5).join(', ')}).`,
      why: 'Generated folders and system files make the project huge, slow to clone and full of merge conflicts, and old build output can be served by mistake.',
      fix: `Add them to .gitignore and run \`git rm -r --cached ${folders.slice(0, 3).join(' ')}\`.`,
    }))
  }
  const big = []
  for (const p of tracked) {
    try {
      const size = fs.statSync(path.join(root, p)).size
      if (size > 2_000_000) big.push([p, size])
    } catch {
      /* gone */
    }
  }
  for (const [p, size] of big.slice(0, 10)) {
    findings.push(f({
      id: 'cruft.large-file',
      phase: /\.(png|jpe?g|gif|webp|avif|mp4|mov|webm)$/i.test(p) ? 'performance' : 'leftovers',
      confidence: 'verified',
      file: p,
      what: `${p} is ${(size / 1e6).toFixed(1)} MB.`,
      why: /\.(png|jpe?g|gif|webp|avif)$/i.test(p) ? 'Large images slow the page on phones and mobile data, and cost visitors money on metered plans.' : 'Large files make the project slow to download and deploy.',
      fix: /\.(png|jpe?g|gif)$/i.test(p) ? 'Export at the size it is displayed (2x for sharp screens), as WebP or AVIF; most images should be under 300 KB.' : 'Host large media elsewhere (a CDN or video host) or compress it.',
    }))
  }

  const has = (rel) => fs.existsSync(path.join(root, rel))
  const tailwindConfig = ['tailwind.config.js', 'tailwind.config.ts', 'tailwind.config.cjs', 'tailwind.config.mjs'].find(has)
  if (stack.tailwind?.major >= 4 && tailwindConfig) {
    const cssUsesConfig = project.grep(/\.css$/, /@config\s/).length > 0
    if (!cssUsesConfig) {
      findings.push(f({
        id: 'cruft.tailwind-v3-config',
        confidence: 'verified',
        file: tailwindConfig,
        what: `${tailwindConfig} is left over from Tailwind v3; this project uses Tailwind v4, which ignores it.`,
        why: 'Colours, fonts or breakpoints set in this file are silently not applied, so the design tokens you think exist may not.',
        fix: 'Move the theme values into your CSS with @theme (Tailwind v4), check the screens look right, then delete the old config. `npx @tailwindcss/upgrade` can do most of this.',
        effort: '30 min',
        source: ['https://tailwindcss.com/docs/upgrade-guide'],
      }))
    }
  }
  const eslintLegacy = ['.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json', '.eslintrc.yml'].find(has)
  const eslintFlat = ['eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', 'eslint.config.ts'].find(has)
  if (eslintLegacy && eslintFlat) {
    findings.push(f({ id: 'cruft.eslint-two-configs', confidence: 'verified', file: eslintLegacy, what: `There are two ESLint configs (${eslintLegacy} and ${eslintFlat}); only ${eslintFlat} is used.`, why: 'Rules added to the old file do nothing, which gives false confidence.', fix: `Move anything still needed into ${eslintFlat} and delete ${eslintLegacy}.` }))
  }
  const bundlers = ['vite.config.ts', 'vite.config.js', 'vite.config.mjs', 'webpack.config.js', 'next.config.js', 'next.config.mjs', 'next.config.ts', 'craco.config.js'].filter(has)
  const kinds = new Set(bundlers.map((b) => b.split('.')[0]))
  if (kinds.size > 1 || (stack.deps['react-scripts'] && stack.deps.vite)) {
    findings.push(f({ id: 'cruft.two-build-tools', severity: 'P1', file: bundlers[0] || 'package.json', what: `Configs for more than one build tool are present (${bundlers.join(', ') || 'react-scripts and vite'}).`, why: 'The project was probably moved from one tool to another and the old one never removed. It is unclear which one actually builds the site.', fix: 'Check which tool the "build" script uses, then remove the other tool\'s config and package.', effort: '30 min' }))
  }

  for (const rel of AGENT_FILES.filter(has).concat(project.list.filter((p) => p.startsWith('.cursor/rules/')))) {
    const text = project.text(rel) || ''
    const stale = Object.entries(FRAMEWORK_WORDS).filter(([word, dep]) => new RegExp(`\\b${word.replace('.', '\\.')}\\b`, 'i').test(text) && !stack.deps[dep]).map(([word]) => word)
    findings.push(f({
      id: stale.length ? 'cruft.agent-rules-stale' : 'cruft.agent-rules-review',
      phase: 'docs',
      severity: stale.length ? 'P1' : 'P2',
      confidence: stale.length ? 'verified' : 'human-only',
      file: rel,
      what: stale.length ? `${rel} tells AI agents about ${stale.join(', ')}, which this project no longer uses.` : `${rel} gives instructions to AI agents. Check it still describes the project.`,
      why: 'AI agents follow these files on every request. Out-of-date instructions steer each future build pass the wrong way and are a common cause of the duplicated code this check finds.',
      fix: 'Update the file to describe the current stack, folder layout and conventions, and delete instructions about tools that were removed.',
      evidenceKey: rel,
    }))
  }

  for (const file of unusedModules(ctx).slice(0, 30)) {
    findings.push(f({
      id: 'cruft.unused-file',
      file,
      what: `Nothing in the project appears to use ${file}.`,
      why: 'Unused files are usually from an earlier version. They make the project harder to understand, and AI agents may copy their outdated patterns.',
      fix: 'Confirm it is not loaded by name somewhere unusual (a CMS, a dynamic import, a config), then delete it and re-run the build.',
    }))
  }

  const names = new Map()
  for (const file of project.matching(/\.(jsx|tsx|vue|svelte|astro)$/)) {
    const base = stem(file).replace(/(Old|New|Copy|V\d|\d+|2)$/, '')
    if (base.startsWith('+') || ENTRY.test(file) || /^(index|page|layout|icon|apple-icon|opengraph-image|twitter-image|sitemap|robots|manifest)$/.test(base)) continue
    names.set(base, [...(names.get(base) || []), file])
  }
  for (const [base, list] of names) {
    if (list.length < 2) continue
    findings.push(f({
      id: 'cruft.duplicate-component',
      file: list[0],
      what: `${list.length} components share the name "${base}": ${list.slice(0, 4).join(', ')}.`,
      why: 'Two versions of the same component usually means one screen got an update and the others did not. The design drifts, and agents edit the wrong one.',
      fix: 'Compare them, keep one, and point every screen at it.',
      effort: '30 min',
      evidenceKey: base,
    }))
  }

  const content = project.grep(/\.(m?[jt]sx?|vue|svelte|astro|html?|md|json)$/i, /lorem ipsum|placehold\.co|via\.placeholder\.com|placekitten|picsum\.photos|source\.unsplash\.com|dummyimage\.com|john\.?doe|jane\.?doe|test@(?:test|example)\.com|acme (?:inc|corp)/i, { limit: 60 })
  const contentFiles = [...new Set(content.filter((h) => !/README|CHANGELOG|\.test\.|\.spec\.|fixtures?\/|(^|\/)(tests?|__tests__|e2e|scripts)\/|(^|\/)test[-_.][^/]*$/.test(h.file)).map((h) => h.file))]
  for (const file of contentFiles.slice(0, 15)) {
    const hit = content.find((h) => h.file === file)
    findings.push(f({
      id: 'cruft.placeholder-content',
      phase: 'leftovers',
      severity: 'P1',
      confidence: 'verified',
      file,
      line: hit.line,
      what: `Placeholder content is still in ${file}.`,
      why: 'Lorem ipsum, stock placeholder images and test names on a live site look unfinished and undermine trust.',
      fix: 'Replace it with real content, or remove the section if it is not ready.',
      evidence: excerpt(hit.text, hit.index),
    }))
  }

  const logs = project.grep(/^(?!.*(\.test\.|\.spec\.|scripts\/|tests?\/)).*\.(m?[jt]sx?|vue|svelte)$/, /\bconsole\.(log|debug)\(|\bdebugger;/, { limit: 400 })
  if (logs.length >= 5) {
    findings.push(f({
      id: 'cruft.console-logs',
      file: logs[0].file,
      line: logs[0].line,
      confidence: 'verified',
      what: `${logs.length} debugging statements (console.log or debugger) are left in the code, across ${new Set(logs.map((l) => l.file)).size} file(s).`,
      why: 'They clutter the browser console, can slow things down, and sometimes print private data (user details, tokens) where anyone can see it.',
      fix: 'Remove them, or keep the useful ones behind a development-only check.',
      effort: '30 min',
    }))
  }
  const todos = project.grep(/\.(m?[jt]sx?|vue|svelte|astro|css)$/, /\b(TODO|FIXME|HACK|XXX)\b/, { limit: 300 })
  if (todos.length >= 5) {
    findings.push(f({
      id: 'cruft.todos',
      phase: 'docs',
      file: todos[0].file,
      line: todos[0].line,
      what: `${todos.length} TODO / FIXME notes are left in the code.`,
      why: 'Each is a known gap someone meant to come back to. Some may be things that must be done before launch.',
      fix: 'Read through them; do the launch-critical ones, turn the rest into tasks, and delete the notes.',
      effort: '30 min',
      evidence: todos.slice(0, 5).map((t) => `${t.file}:${t.line} ${excerpt(t.text, t.index, 80)}`).join('\n'),
    }))
  }

  const readme = ['README.md', 'readme.md', 'Readme.md'].find(has)
  const readmeText = readme ? project.text(readme) || '' : ''
  if (!readme || /This is a \[Next\.js\]|React \+ TypeScript \+ Vite|Getting Started with Create React App|bootstrapped with|# sv\b|Astro Starter Kit/i.test(readmeText) || readmeText.length < 300) {
    findings.push(f({
      id: 'cruft.readme',
      phase: 'docs',
      severity: 'P2',
      confidence: 'verified',
      file: readme || 'README.md',
      what: readme ? 'The README is the framework\'s default text or too short to be useful.' : 'There is no README.',
      why: 'The README is the first thing a developer, a future you, or an AI agent reads. Without it, every handover starts from scratch.',
      fix: 'Write what the project is, how to run it, which environment variables it needs (names only), and how it is deployed.',
      effort: '30 min',
    }))
  }

  const envNames = new Set()
  for (const hit of project.grep(/\.(m?[jt]sx?|vue|svelte|astro)$/, /\b(?:process\.env|import\.meta\.env)\.([A-Z][A-Z0-9_]+)/, { limit: 500 })) envNames.add(hit.groups[0])
  for (const hit of project.grep(/\.(m?[jt]sx?)$/, /\bDeno\.env\.get\(\s*['"]([A-Z][A-Z0-9_]+)['"]/, { limit: 100 })) envNames.add(hit.groups[0])
  const builtIn = /^(NODE_ENV|MODE|DEV|PROD|SSR|BASE_URL|PORT|VERCEL.*|CI|NEXT_RUNTIME|NETLIFY.*)$/
  const needed = [...envNames].filter((n) => !builtIn.test(n))
  if (needed.length) {
    const exampleFile = ['.env.example', '.env.sample', '.env.template', '.env.local.example'].find(has)
    const example = exampleFile ? project.text(exampleFile) || '' : ''
    const missing = needed.filter((n) => !new RegExp(`^\\s*${n}\\s*=`, 'm').test(example))
    if (missing.length) {
      findings.push(f({
        id: 'cruft.env-example',
        phase: 'docs',
        severity: 'P2',
        confidence: 'verified',
        file: exampleFile || '.env.example',
        what: exampleFile ? `${missing.length} environment variable(s) used in code are missing from ${exampleFile}: ${missing.slice(0, 8).join(', ')}.` : `The code uses ${needed.length} environment variable(s) but there is no .env.example listing them.`,
        why: 'Without a list of required settings, anyone deploying the project (including you on a new laptop) finds out what is missing only when something breaks.',
        fix: `Create or update ${exampleFile || '.env.example'} with each variable name and an empty or dummy value. Never put real values in it.`,
      }))
    }
  }
  return findings
}
