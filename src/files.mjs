import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const SKIP_DIRS = /(^|\/)(node_modules|\.git|\.next|\.nuxt|\.svelte-kit|\.astro|\.output|\.vercel|\.netlify|\.turbo|\.cache|\.preflight|dist|build|out|coverage|vendor)(\/|$)/
export const TEXT = /\.(m?[jt]sx?|cjs|vue|svelte|astro|html?|css|scss|sass|less|json|md|mdx|ya?ml|toml|txt|env|example|rules|mdc|sql)$/i
export const CODE = /\.(m?[jt]sx?|cjs|vue|svelte|astro)$/i
export const STYLE = /\.(css|scss|sass|less)$/i
export const MARKUP = /\.(html?|[jt]sx|vue|svelte|astro)$/i
const MAX_BYTES = 400_000

function walk(root) {
  const out = []
  const visit = (dir, rel) => {
    let entries = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const relPath = rel ? `${rel}/${entry.name}` : entry.name
      if (SKIP_DIRS.test(relPath)) continue
      if (entry.isDirectory()) visit(path.join(dir, entry.name), relPath)
      else if (entry.isFile()) out.push(relPath)
    }
  }
  visit(root, '')
  return out
}

export function isGitRepo(root) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().length > 0
  } catch {
    return false
  }
}

/** Files git would commit (tracked or new, not ignored); every file when there is no git. */
export function projectFiles(root) {
  if (isGitRepo(root)) {
    try {
      const raw = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
      return raw.split('\0').filter((p) => p && !SKIP_DIRS.test(p) && fs.existsSync(path.join(root, p)))
    } catch {
      /* fall back to a walk */
    }
  }
  return walk(root)
}

/** Files committed to git, including ones that should never be there (node_modules, build output). */
export function trackedFiles(root) {
  if (!isGitRepo(root)) return []
  try {
    return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\0').filter(Boolean)
  } catch {
    return []
  }
}

export function isIgnored(root, rel) {
  if (!isGitRepo(root)) return false
  try {
    execFileSync('git', ['check-ignore', '-q', rel], { cwd: root, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

export class Project {
  constructor(root) {
    this.root = root
    this.list = projectFiles(root)
    this.cache = new Map()
  }

  text(rel) {
    if (this.cache.has(rel)) return this.cache.get(rel)
    let value = null
    try {
      const abs = path.join(this.root, rel)
      const stat = fs.statSync(abs)
      if (stat.size <= MAX_BYTES) value = fs.readFileSync(abs, 'utf8')
    } catch {
      /* unreadable */
    }
    this.cache.set(rel, value)
    return value
  }

  matching(re) {
    return this.list.filter((p) => re.test(p))
  }

  exists(rel) {
    return fs.existsSync(path.join(this.root, rel))
  }

  /** Every match of `re` across files matching `fileRe`, with file and line. */
  grep(fileRe, re, { limit = 200 } = {}) {
    const hits = []
    const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`
    const global = new RegExp(re.source, flags)
    for (const file of this.matching(fileRe)) {
      const text = this.text(file)
      if (!text) continue
      for (const m of text.matchAll(global)) {
        hits.push({ file, line: lineOf(text, m.index), match: m[0], groups: m.slice(1), index: m.index, text })
        if (hits.length >= limit) return hits
      }
    }
    return hits
  }
}

export function lineOf(text, index) {
  let line = 1
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) line++
  return line
}

export function excerpt(text, index, width = 120) {
  const start = text.lastIndexOf('\n', index) + 1
  const end = text.indexOf('\n', index)
  return text.slice(start, end < 0 ? undefined : end).trim().slice(0, width)
}
