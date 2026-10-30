import fs from 'node:fs'
import path from 'node:path'
import { isGitRepo } from './files.mjs'
import { chromePath, flowmapBin, which } from './util.mjs'

export function readPackage(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  } catch {
    return null
  }
}

const LOCKFILES = {
  'package-lock.json': 'npm',
  'npm-shrinkwrap.json': 'npm',
  'pnpm-lock.yaml': 'pnpm',
  'yarn.lock': 'yarn',
  'bun.lockb': 'bun',
  'bun.lock': 'bun',
}

function major(range) {
  const m = String(range || '').match(/(\d+)/)
  return m ? Number(m[1]) : null
}

function installedMajor(root, name, fallbackRange) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'node_modules', name, 'package.json'), 'utf8'))
    return major(pkg.version)
  } catch {
    return major(fallbackRange)
  }
}

export function detectStack(root) {
  const pkg = readPackage(root)
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) }
  const has = (name) => Boolean(deps[name])
  const exists = (rel) => fs.existsSync(path.join(root, rel))
  const lockfiles = Object.keys(LOCKFILES).filter(exists)
  const packageManager = pkg?.packageManager?.split('@')[0] || (lockfiles[0] ? LOCKFILES[lockfiles[0]] : pkg ? 'npm' : null)

  let framework = { id: 'static', name: 'Plain HTML/CSS/JS' }
  if (has('next')) framework = { id: 'next', name: 'Next.js', major: installedMajor(root, 'next', deps.next) }
  else if (has('nuxt')) framework = { id: 'nuxt', name: 'Nuxt' }
  else if (has('@sveltejs/kit')) framework = { id: 'sveltekit', name: 'SvelteKit' }
  else if (has('astro')) framework = { id: 'astro', name: 'Astro' }
  else if (has('@remix-run/react') || has('@react-router/dev')) framework = { id: 'remix', name: 'Remix / React Router' }
  else if (has('vite') && (has('react') || has('react-dom'))) framework = { id: 'vite-react', name: 'Vite + React' }
  else if (has('vite') && has('vue')) framework = { id: 'vue', name: 'Vite + Vue' }
  else if (has('vite') && has('svelte')) framework = { id: 'svelte', name: 'Vite + Svelte' }
  else if (has('react-scripts')) framework = { id: 'cra', name: 'Create React App' }
  else if (has('vite')) framework = { id: 'vite', name: 'Vite' }
  else if (has('react')) framework = { id: 'react', name: 'React' }
  else if (has('electron')) framework = { id: 'electron', name: 'Electron' }
  else if (pkg && !fs.existsSync(path.join(root, 'index.html'))) framework = { id: 'node', name: 'Node.js' }

  const backends = []
  if (has('@supabase/supabase-js') || has('@supabase/ssr') || exists('supabase')) backends.push('supabase')
  if (has('firebase') || has('firebase-admin') || exists('firebase.json')) backends.push('firebase')
  if (has('@prisma/client') || exists('prisma/schema.prisma')) backends.push('prisma')
  if (has('drizzle-orm')) backends.push('drizzle')
  if (has('stripe') || has('@stripe/stripe-js')) backends.push('stripe')
  const ai = ['openai', '@anthropic-ai/sdk', 'ai', '@ai-sdk/openai', '@google/generative-ai', '@google/genai', 'langchain', '@langchain/core', 'replicate'].filter(has)

  return {
    root,
    hasPackageJson: Boolean(pkg),
    pkg,
    deps,
    scripts: pkg?.scripts || {},
    packageManager,
    lockfiles,
    framework,
    typescript: has('typescript') || exists('tsconfig.json'),
    tailwind: has('tailwindcss') ? { major: installedMajor(root, 'tailwindcss', deps.tailwindcss) } : null,
    linter: has('@biomejs/biome') ? 'biome' : has('eslint') ? 'eslint' : null,
    backends,
    ai,
    installed: fs.existsSync(path.join(root, 'node_modules')),
    browserslist: Boolean(pkg?.browserslist) || exists('.browserslistrc'),
  }
}

export function detectCapabilities() {
  return {
    node: process.versions.node,
    git: Boolean(which('git')),
    chrome: chromePath(),
    flowmap: Boolean(flowmapBin()),
    gitleaks: which('gitleaks'),
    osvScanner: which('osv-scanner'),
  }
}

export function describe(stack, root) {
  return {
    framework: stack.framework.name,
    packageManager: stack.packageManager,
    typescript: stack.typescript,
    tailwind: stack.tailwind ? `v${stack.tailwind.major}` : null,
    backends: stack.backends,
    ai: stack.ai,
    git: isGitRepo(root),
    dependenciesInstalled: stack.installed,
  }
}
