import puppeteer from 'puppeteer-core'
import { chromePath } from './util.mjs'
import { flowmapRoutes } from './server.mjs'

/** Emulated devices. They catch layout and touch problems, but they are not real iPhones (WebKit) or Android phones. */
export const VIEWPORTS = {
  desktop: { label: 'Desktop (1440px)', width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  iphone: {
    label: 'iPhone (390px)',
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  },
  android: {
    label: 'Android (412px)',
    width: 412,
    height: 915,
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
  },
  tablet: { label: 'Tablet (768px)', width: 768, height: 1024, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
}

const RISKY_LINK = /log-?out|sign-?out|delete|remove|unsubscribe|cancel|destroy|reset/i
const ASSET = /\.(png|jpe?g|gif|webp|avif|svg|ico|pdf|zip|mp4|webm|mp3|woff2?|css|js|json|xml|txt)$/i

export async function launchBrowser() {
  const executablePath = chromePath()
  if (!executablePath) throw new Error('Chrome, Chromium or Edge was not found. Install Chrome or set CHROME_PATH.')
  return puppeteer.launch({ executablePath, headless: true, timeout: 30_000, args: ['--disable-gpu', '--no-first-run', '--no-default-browser-check'] })
}

export async function setViewport(page, name) {
  const v = VIEWPORTS[name]
  if (v.userAgent) await page.setUserAgent(v.userAgent)
  await page.setViewport({ width: v.width, height: v.height, deviceScaleFactor: v.deviceScaleFactor, isMobile: v.isMobile, hasTouch: v.hasTouch })
}

export function joinUrl(base, route) {
  return new URL(route, base.endsWith('/') ? base : `${base}/`).toString()
}

/** Wait for load, then briefly for the network to settle; dev servers and analytics never fully go quiet. */
export async function visit(page, url) {
  const res = await page.goto(url, { waitUntil: 'load', timeout: 30_000 })
  await page.waitForNetworkIdle({ idleTime: 300, timeout: 1500 }).catch(() => {})
  return res
}

async function linksOn(page, base) {
  const origin = new URL(base).origin
  const hrefs = await page.$$eval('a[href]', (nodes) => nodes.map((n) => n.getAttribute('href') || ''))
  const out = []
  for (const href of hrefs) {
    if (!href || href.startsWith('#') || /^(mailto|tel|javascript):/i.test(href)) continue
    let u
    try {
      u = new URL(href, page.url())
    } catch {
      continue
    }
    if (u.origin !== origin || ASSET.test(u.pathname) || RISKY_LINK.test(u.pathname)) continue
    out.push(u.pathname.replace(/\/index\.html?$/, '/').replace(/\/$/, '') || '/')
  }
  return out
}

function matchesPattern(route, href) {
  const want = route.split('/').filter(Boolean)
  const got = href.split('/').filter(Boolean)
  return got.length === want.length && want.every((part, i) => part.startsWith('[') || part.startsWith(':') || part.toLowerCase() === got[i]?.toLowerCase())
}

/** Turn `/prints/[slug]` into a real link that a parent page shows. */
async function concrete(page, base, route) {
  if (!/\[|:/.test(route)) return route
  let parent = route.replace(/\/(\[[^\]]+\]|:[^/]+).*$/, '') || '/'
  for (let i = 0; i < 4; i++) {
    try {
      await visit(page, joinUrl(base, parent))
      const hit = (await linksOn(page, base)).find((href) => matchesPattern(route, href))
      if (hit) return hit
    } catch {
      /* try the level above */
    }
    if (parent === '/') break
    parent = parent.replace(/\/[^/]+$/, '') || '/'
  }
  return null
}

/**
 * Follow links from the home page, the way a visitor would. Skips links that look like they change data,
 * and keeps two examples per folder so twenty product pages built from one template count once.
 */
async function crawl(page, base, max) {
  const seen = new Set(['/'])
  const queue = [['/', 0]]
  const order = []
  const perFolder = new Map()
  const sameTemplate = (route) => {
    const parts = route.split('/').filter(Boolean)
    if (parts.length < 2) return false
    const folder = parts.slice(0, -1).join('/')
    perFolder.set(folder, (perFolder.get(folder) || 0) + 1)
    return perFolder.get(folder) > 2
  }
  while (queue.length && order.length < max) {
    const [route, depth] = queue.shift()
    try {
      const res = await visit(page, joinUrl(base, route))
      if (res && res.status() >= 400 && route !== '/') continue
      order.push(route)
      if (depth >= 3) continue
      for (const link of await linksOn(page, base)) {
        if (seen.has(link)) continue
        seen.add(link)
        if (!sameTemplate(link)) queue.push([link, depth + 1])
      }
    } catch {
      /* unreachable page */
    }
  }
  return order
}

/**
 * Decide which screens to check: an explicit list, FlowMap's map, or a crawl.
 * Returns { screens: [{ route, path, name }], source, skipped: [] }.
 */
export async function discoverScreens(page, base, { routes, routesFrom, root, max = 20 } = {}) {
  let wanted = null
  let source = 'crawl'
  if (routes?.length) {
    wanted = routes.map((route) => ({ route, name: route }))
    source = 'list'
  } else if (routesFrom === 'flowmap') {
    const mapped = await flowmapRoutes(root)
    if (mapped?.length) {
      wanted = mapped
      source = 'flowmap'
    } else source = 'crawl (FlowMap was unavailable)'
  }
  if (!wanted) return { screens: (await crawl(page, base, max)).map((route) => ({ route, path: route, name: route })), source, skipped: [] }
  const screens = []
  const skipped = []
  for (const s of wanted.slice(0, max * 2)) {
    if (/^\/api(\/|$)/.test(s.route)) continue
    const path = await concrete(page, base, s.route)
    if (path) screens.push({ ...s, path })
    else skipped.push(s.route)
    if (screens.length >= max) break
  }
  return { screens, source, skipped }
}
