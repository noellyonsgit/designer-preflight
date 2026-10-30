import fs from 'node:fs'
import path from 'node:path'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import { VIEWPORTS, discoverScreens, joinUrl, launchBrowser, setViewport, visit } from './browser.mjs'
import { detectStack } from './detect.mjs'
import { saveProgress, stateDir } from './findings.mjs'
import { ensureServer } from './server.mjs'
import { slug } from './util.mjs'

const SIZES = ['iphone', 'android', 'tablet', 'desktop']
const MAX_HEIGHT = 6000

const FREEZE_CSS = '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important;caret-color:transparent!important;scroll-behavior:auto!important}'

async function shoot(root, dir, opts) {
  const stack = detectStack(root)
  const server = await ensureServer(root, stack, { url: opts.url, preferProduction: true, log: opts.log })
  const browser = await launchBrowser()
  const saved = []
  try {
    const page = await browser.newPage()
    await setViewport(page, 'desktop')
    const manifestFile = path.join(stateDir(root), 'baseline', 'manifest.json')
    let screens
    if (opts.reuseManifest && fs.existsSync(manifestFile)) screens = JSON.parse(fs.readFileSync(manifestFile, 'utf8')).screens
    else screens = (await discoverScreens(page, server.url, { routes: opts.routes, routesFrom: opts.routesFrom, root })).screens
    fs.mkdirSync(dir, { recursive: true })
    for (const screen of screens) {
      for (const size of SIZES) {
        await setViewport(page, size)
        try {
          await visit(page, joinUrl(server.url, screen.path))
          await page.addStyleTag({ content: FREEZE_CSS })
          await page.evaluate(() => document.fonts?.ready)
          const height = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0))
          const file = path.join(dir, `${slug(screen.route)}@${size}.png`)
          await page.screenshot({ path: file, type: 'png', clip: { x: 0, y: 0, width: VIEWPORTS[size].width, height: Math.min(Math.max(height, VIEWPORTS[size].height), MAX_HEIGHT) }, captureBeyondViewport: true })
          saved.push({ route: screen.route, size, file: path.relative(root, file) })
        } catch (err) {
          opts.log(`  could not capture ${screen.route} at ${VIEWPORTS[size].label}: ${String(err.message).split('\n')[0]}`)
        }
      }
      opts.log(`  ${screen.route}`)
    }
    return { screens, saved, mode: server.mode }
  } finally {
    await browser.close().catch(() => {})
    await server.stop().catch(() => {})
  }
}

/** Screenshot every screen at phone, tablet and desktop sizes, before any fixes. */
export async function baseline(rootArg, opts = {}) {
  const root = path.resolve(rootArg)
  const log = opts.log || (() => {})
  const dir = path.join(stateDir(root), 'baseline')
  fs.rmSync(dir, { recursive: true, force: true })
  const result = await shoot(root, dir, { ...opts, log })
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ version: 1, at: new Date().toISOString(), screens: result.screens, shots: result.saved }, null, 2))
  saveProgress(root, { phases: { safety: { status: 'baseline', at: new Date().toISOString() } } })
  return { ok: true, screens: result.screens.length, shots: result.saved.length, dir: path.relative(root, dir), message: `Saved ${result.saved.length} screenshots of ${result.screens.length} ${result.screens.length === 1 ? 'screen' : 'screens'} to ${path.relative(root, dir)}. Run "preflight compare" after making changes.` }
}

function pad(png, width, height) {
  if (png.width === width && png.height === height) return png
  const out = new PNG({ width, height })
  out.data.fill(255)
  PNG.bitblt(png, out, 0, 0, Math.min(png.width, width), Math.min(png.height, height), 0, 0)
  return out
}

/** Take new screenshots of the same screens and highlight every pixel that changed. */
export async function compare(rootArg, opts = {}) {
  const root = path.resolve(rootArg)
  const log = opts.log || (() => {})
  const base = path.join(stateDir(root), 'baseline')
  if (!fs.existsSync(path.join(base, 'manifest.json'))) throw new Error('There is no baseline yet. Run "preflight baseline" before making changes.')
  const current = path.join(stateDir(root), 'current')
  const diffDir = path.join(stateDir(root), 'diff')
  fs.rmSync(current, { recursive: true, force: true })
  fs.rmSync(diffDir, { recursive: true, force: true })
  fs.mkdirSync(diffDir, { recursive: true })
  const result = await shoot(root, current, { ...opts, log, reuseManifest: true })

  const changes = []
  for (const shot of result.saved) {
    const name = path.basename(shot.file)
    const before = path.join(base, name)
    if (!fs.existsSync(before)) {
      changes.push({ route: shot.route, size: shot.size, changed: 100, note: 'new screen' })
      continue
    }
    const a = PNG.sync.read(fs.readFileSync(before))
    const b = PNG.sync.read(fs.readFileSync(path.join(current, name)))
    const width = Math.max(a.width, b.width)
    const height = Math.max(a.height, b.height)
    const diff = new PNG({ width, height })
    const pixels = pixelmatch(pad(a, width, height).data, pad(b, width, height).data, diff.data, width, height, { threshold: 0.1, alpha: 0.2 })
    const changed = Math.round((pixels / (width * height)) * 10000) / 100
    if (pixels > 0) {
      fs.writeFileSync(path.join(diffDir, name), PNG.sync.write(diff))
      changes.push({ route: shot.route, size: shot.size, changed, heightChange: b.height - a.height, before: path.relative(root, before), after: shot.file, diff: path.relative(root, path.join(diffDir, name)) })
    }
  }
  changes.sort((x, y) => y.changed - x.changed)
  const summary = { at: new Date().toISOString(), compared: result.saved.length, changed: changes.length, changes }
  fs.writeFileSync(path.join(diffDir, 'summary.json'), JSON.stringify(summary, null, 2))
  const lines = changes.length
    ? [`${changes.length} of ${result.saved.length} screenshots changed. Check each one is a change you meant to make:`, ...changes.slice(0, 20).map((c) => `  ${c.route} on ${VIEWPORTS[c.size].label}: ${c.note || `${c.changed}% of the screen changed${c.heightChange ? `, ${c.heightChange > 0 ? 'taller' : 'shorter'} by ${Math.abs(c.heightChange)}px` : ''}`}`), `Red areas in ${path.relative(root, diffDir)} show exactly what changed.`]
    : [`No visual changes across ${result.saved.length} screenshots.`]
  return { ok: true, ...summary, message: lines.join('\n') }
}
