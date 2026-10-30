import { spawn, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** Run a command without a shell; never throws, returns code, output and whether it timed out. */
export function run(cmd, args, { cwd, timeoutMs = 300_000, env } = {}) {
  return new Promise((resolve) => {
    let out = ''
    let timedOut = false
    let child
    try {
      child = spawn(cmd, args, { cwd, env: { ...process.env, CI: '1', FORCE_COLOR: '0', NO_COLOR: '1', ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (err) {
      resolve({ code: 127, out: String(err.message || err), timedOut })
      return
    }
    const push = (buf) => {
      out += buf.toString()
      if (out.length > 2_000_000) out = out.slice(-2_000_000)
    }
    child.stdout.on('data', push)
    child.stderr.on('data', push)
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 3000)
    }, timeoutMs)
    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ code: 127, out: out + String(err.message || err), timedOut })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? 1, out, timedOut })
    })
  })
}

export function which(bin) {
  try {
    const found = execFileSync(process.platform === 'win32' ? 'where' : 'which', [bin], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n')[0]
    return found || null
  } catch {
    return null
  }
}

export function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean)
  return candidates.find((p) => fs.existsSync(p)) || null
}

/** FlowMap is optional. Look for an explicit path, then the `flowmap` command. */
export function flowmapBin() {
  const explicit = process.env.FLOWMAP_BIN
  if (explicit && fs.existsSync(explicit)) return { cmd: process.execPath, args: [explicit] }
  const dir = process.env.FLOWMAP_DIR
  if (dir && fs.existsSync(path.join(dir, 'bin', 'flowmap.js'))) return { cmd: process.execPath, args: [path.join(dir, 'bin', 'flowmap.js')] }
  const onPath = which('flowmap')
  if (onPath) return { cmd: onPath, args: [] }
  const sibling = path.join(os.homedir(), 'Sites', 'FlowMap', 'bin', 'flowmap.js')
  if (fs.existsSync(sibling)) return { cmd: process.execPath, args: [sibling] }
  return null
}

export function localBin(root, name) {
  const p = path.join(root, 'node_modules', '.bin', name)
  return fs.existsSync(p) ? p : null
}

export async function fetchJson(url, options = {}, timeoutMs = 20_000) {
  let last
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) })
      if (res.ok) return res.json()
      const err = new Error(`${res.status} ${res.statusText} from ${url}`)
      err.status = res.status
      if (res.status !== 429 && res.status < 500) throw err
      last = err
    } catch (err) {
      if (err.status && err.status !== 429 && err.status < 500) throw err
      last = err
    }
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)))
  }
  throw last
}

export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i], i)
    }
  })
  await Promise.all(workers)
  return out
}

export function tail(text, lines = 25) {
  return String(text || '').trim().split('\n').slice(-lines).join('\n')
}

export function slug(route) {
  return (route === '/' ? 'home' : route.replace(/^\/+|\/+$/g, '').replace(/[^a-z0-9]+/gi, '-')).toLowerCase().slice(0, 80) || 'home'
}
