import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import { flowmapBin, localBin, run as exec } from './util.mjs'

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.webm': 'video/webm', '.txt': 'text/plain', '.xml': 'application/xml', '.pdf': 'application/pdf' }

function portFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)))
  })
}

async function freePort(start = 4400) {
  for (let port = start; port < start + 60; port++) if (await portFree(port)) return port
  throw new Error('No free port to start the site on')
}

export async function urlReady(url) {
  try {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(4000) })
    return res.status >= 100 && res.status < 500
  } catch {
    return false
  }
}

/** A minimal static server for plain HTML projects. Only serves files inside `dir`, only on 127.0.0.1. */
function staticServer(dir, port) {
  const base = path.resolve(dir)
  const server = http.createServer((req, res) => {
    let rel
    try {
      rel = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    } catch {
      res.writeHead(400).end()
      return
    }
    let file = path.resolve(base, `.${rel}`)
    if (file !== base && !file.startsWith(base + path.sep)) {
      res.writeHead(403).end()
      return
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html')
    if (!fs.existsSync(file) && fs.existsSync(`${file}.html`)) file = `${file}.html`
    if (!fs.existsSync(file)) {
      const notFound = path.join(base, '404.html')
      res.writeHead(404, { 'content-type': TYPES['.html'] })
      res.end(fs.existsSync(notFound) ? fs.readFileSync(notFound) : 'Not found')
      return
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' })
    fs.createReadStream(file).pipe(res)
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}

/** Production preview when a fresh build exists (truer speed numbers, no dev overlays); dev server otherwise. */
function launchCommand(root, stack, port, preferProduction) {
  const bin = (name) => localBin(root, name)
  const id = stack.framework.id
  if (id === 'next' && bin('next')) {
    return preferProduction && fs.existsSync(path.join(root, '.next', 'BUILD_ID'))
      ? { cmd: bin('next'), args: ['start', '-p', String(port), '-H', '127.0.0.1'], mode: 'production' }
      : { cmd: bin('next'), args: ['dev', '-p', String(port), '-H', '127.0.0.1'], mode: 'development' }
  }
  if (id === 'astro' && bin('astro')) {
    return preferProduction && fs.existsSync(path.join(root, 'dist'))
      ? { cmd: bin('astro'), args: ['preview', '--port', String(port), '--host', '127.0.0.1'], mode: 'production' }
      : { cmd: bin('astro'), args: ['dev', '--port', String(port), '--host', '127.0.0.1'], mode: 'development' }
  }
  if (bin('vite')) {
    return preferProduction && fs.existsSync(path.join(root, 'dist'))
      ? { cmd: bin('vite'), args: ['preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], mode: 'production' }
      : { cmd: bin('vite'), args: ['--port', String(port), '--strictPort', '--host', '127.0.0.1'], mode: 'development' }
  }
  if (stack.scripts.dev) return { cmd: 'npm', args: ['run', 'dev', '--', '--port', String(port), '--host', '127.0.0.1'], mode: 'development' }
  if (stack.scripts.start) return { cmd: 'npm', args: ['start'], env: { PORT: String(port), HOST: '127.0.0.1' }, mode: 'development' }
  return null
}

/**
 * Use the URL the designer gave, or start the site. Returns { url, mode, stop() }.
 * Static projects are served directly; others use their own dev or preview server.
 */
export async function ensureServer(root, stack, { url, preferProduction = false, log = () => {} } = {}) {
  if (url) {
    const clean = url.replace(/\/$/, '')
    if (!(await urlReady(clean))) throw new Error(`Nothing is responding at ${clean}`)
    return { url: clean, mode: 'given', stop: async () => {} }
  }
  const port = await freePort()
  const local = `http://127.0.0.1:${port}`

  if (stack.framework.id === 'static' || (!stack.hasPackageJson && fs.existsSync(path.join(root, 'index.html')))) {
    const server = await staticServer(root, port)
    return { url: local, mode: 'static', stop: () => new Promise((r) => server.close(() => r())) }
  }
  if (!stack.installed) throw new Error('Dependencies are not installed, so the site cannot be started. Run the install command first.')
  const launch = launchCommand(root, stack, port, preferProduction)
  if (!launch) throw new Error('No dev, preview or start command was found in package.json.')
  log(`Starting the site (${launch.mode})…`)
  const proc = spawn(launch.cmd, launch.args, { cwd: root, env: { ...process.env, PORT: String(port), BROWSER: 'none', ...launch.env }, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' })
  let output = ''
  const keep = (buf) => {
    output = (output + buf.toString()).slice(-8000)
  }
  proc.stdout.on('data', keep)
  proc.stderr.on('data', keep)
  const stop = async () => {
    if (proc.exitCode != null) return
    try {
      process.platform === 'win32' ? proc.kill('SIGTERM') : process.kill(-proc.pid, 'SIGTERM')
    } catch {
      proc.kill('SIGTERM')
    }
  }
  const started = Date.now()
  while (Date.now() - started < 120_000) {
    if (proc.exitCode != null) throw new Error(`The site stopped while starting.\n${output.slice(-1500)}`)
    if (await urlReady(local)) return { url: local, mode: launch.mode, stop }
    await new Promise((r) => setTimeout(r, 500))
  }
  await stop()
  throw new Error(`The site did not start within two minutes.\n${output.slice(-1500)}`)
}

/** Ask FlowMap for the screens it mapped. Returns null when FlowMap is unavailable or fails. */
export async function flowmapRoutes(root) {
  const bin = flowmapBin()
  if (!bin) return null
  const res = await exec(bin.cmd, [...bin.args, 'map', root, '--json'], { timeoutMs: 120_000 })
  if (res.code !== 0) return null
  try {
    const data = JSON.parse(res.out.slice(res.out.indexOf('{')))
    const screens = data.screens || data.nodes || []
    return screens.map((s) => ({ route: s.route, name: s.name || s.label || s.route, lane: s.lane || null })).filter((s) => s.route?.startsWith('/'))
  } catch {
    return null
  }
}
