/** Desktop Tab walk. axe-core only sees the page as it loaded; these failures appear after focus moves. */

export const TAB_CAP = 40

/**
 * A sequence that repeats at the end of the walk, with different controls before it.
 * A full cycle of the page (the repeat is the whole walk) returns null.
 */
export function repeatedCycle(keys) {
  const n = keys.length
  // Length 1 is a stuck control, handled separately. A cycle here is a group that repeats.
  for (let len = 2; len <= Math.floor(n / 2); len++) {
    let match = true
    for (let i = 0; i < len; i++) {
      if (keys[n - len + i] !== keys[n - 2 * len + i]) {
        match = false
        break
      }
    }
    if (!match) continue
    const cycle = keys.slice(n - len)
    const before = keys.slice(0, n - 2 * len)
    const inside = new Set(cycle)
    if (!before.some((key) => !inside.has(key))) continue
    return [...new Set(cycle)]
  }
  return null
}

function label(stop) {
  return stop.name || stop.key
}

/**
 * Long jumps only. A new column to the right is a normal top-to-bottom pass, so an upward
 * move with a clear rightward move is not flagged. Meaning still needs a person: this is a hint.
 */
export function focusJumps(stops) {
  if (!stops || stops.length < 4) return []
  const jumps = []
  for (let i = 0; i < stops.length - 1; i++) {
    const current = stops[i]
    const next = stops[i + 1]
    if (current.how === 'off-screen' || next.how === 'off-screen' || current.how === 'ignored' || next.how === 'ignored') continue
    if (next.key === stops[0].key) continue
    const dy = next.y - current.y
    const dx = next.x - current.x
    const dist = Math.hypot(dx, dy)
    if (dy < -160 && dx < 80) {
      jumps.push({ from: label(current), to: label(next), kind: 'up' })
      continue
    }
    const nearer = stops.slice(i + 2).find((other) => {
      if (other.how === 'off-screen' || other.how === 'ignored') return false
      const uy = other.y - current.y
      const ux = other.x - current.x
      const after = uy > 24 || (Math.abs(uy) <= 24 && ux > 24)
      if (!after) return false
      const udist = Math.hypot(ux, uy)
      return udist + 100 < dist && udist < 280
    })
    if (nearer && dist > 420) jumps.push({ from: label(current), to: label(next), kind: 'skip', nearer: label(nearer) })
  }
  return jumps.slice(0, 4)
}

export function judgeWalk(walk) {
  const stops = walk?.stops || []
  const obscured = []
  const seen = new Set()
  for (const stop of stops) {
    if (!stop.obscured || seen.has(stop.key)) continue
    seen.add(stop.key)
    obscured.push(stop)
    if (obscured.length >= 4) break
  }
  const reached = new Set(stops.map((stop) => stop.key)).size
  const others = Math.max(walk?.tabbableCount || 0, reached)
  const trap = walk?.trapped?.via === 'stuck' && others > 1 ? walk.trapped : null
  const cycle = !trap && walk?.cycle && !walk.cycle.escaped ? walk.cycle : null
  return { obscured, trap, cycle, jumps: focusJumps(stops) }
}

/** Installed in the page. Kept self-contained so Puppeteer can serialize it. */
function installFocusProbe() {
  if (window.__preflightFocus) return
  const IGNORE = new Set(['NEXTJS-PORTAL', 'VITE-ERROR-OVERLAY', 'ASTRO-DEV-TOOLBAR'])

  function ignored(node) {
    let current = node
    while (current && current.nodeType === 1) {
      if (IGNORE.has(current.tagName)) return true
      if (current.id === '__next-build-watcher' || current.hasAttribute('data-nextjs-toast')) return true
      current = current.parentElement
    }
    return false
  }

  function describe(el) {
    const id = el.id ? `#${CSS.escape(el.id)}` : ''
    const cls = (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 2)
    return `${el.tagName.toLowerCase()}${id}${cls.length ? `.${cls.join('.')}` : ''}`.slice(0, 80)
  }

  function nameOf(el) {
    const fromLabel = el.labels && el.labels[0] ? el.labels[0].innerText : ''
    const text = el.getAttribute('aria-label') || fromLabel || el.innerText || el.getAttribute('title') || el.getAttribute('placeholder') || el.getAttribute('alt') || ''
    return text.trim().replace(/\s+/g, ' ').slice(0, 40)
  }

  function selector(el) {
    if (el.id) return `#${CSS.escape(el.id)}`
    const parts = []
    let node = el
    while (node && node.nodeType === 1 && node !== document.body && parts.length < 5) {
      if (node.id) {
        parts.unshift(`#${CSS.escape(node.id)}`)
        break
      }
      const parent = node.parentElement
      const index = parent ? [...parent.children].indexOf(node) + 1 : 1
      parts.unshift(`${node.tagName.toLowerCase()}:nth-child(${index})`)
      node = parent
    }
    return parts.join(' > ')
  }

  function deepActive() {
    let el = document.activeElement
    while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement
    return el
  }

  function hidden(el) {
    if (el.closest('[inert], [hidden]')) return true
    const style = getComputedStyle(el)
    return style.display === 'none' || style.visibility === 'hidden'
  }

  function position(el) {
    const style = getComputedStyle(el)
    if (style.position === 'fixed') {
      const rect = el.getBoundingClientRect()
      return { x: Math.round(rect.left), y: Math.round(rect.top) }
    }
    let x = 0
    let y = 0
    let node = el
    const seen = new Set()
    while (node && !seen.has(node)) {
      seen.add(node)
      x += node.offsetLeft || 0
      y += node.offsetTop || 0
      node = node.offsetParent
    }
    if (!x && !y) {
      const rect = el.getBoundingClientRect()
      return { x: Math.round(rect.left + window.scrollX), y: Math.round(rect.top + window.scrollY) }
    }
    return { x: Math.round(x), y: Math.round(y) }
  }

  function visuallyHidden(node) {
    let current = node
    while (current && current !== document.documentElement) {
      const style = getComputedStyle(current)
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return true
      current = current.parentElement
    }
    return false
  }

  function visualHit(x, y) {
    for (const node of document.elementsFromPoint(x, y)) {
      if (node === document.documentElement || node === document.body) continue
      if (ignored(node) || visuallyHidden(node)) continue
      return node
    }
    return null
  }

  function stickies() {
    if (window.__preflightFocus._stickies) return window.__preflightFocus._stickies.filter((node) => node.isConnected)
    const found = []
    for (const node of document.body.querySelectorAll('*')) {
      const style = getComputedStyle(node)
      if (style.position !== 'fixed' && style.position !== 'sticky') continue
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue
      const rect = node.getBoundingClientRect()
      if (rect.width >= 1 && rect.height >= 8) found.push(node)
    }
    window.__preflightFocus._stickies = found
    return found
  }

  function occlusion(el) {
    const style = getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return { how: 'ignored' }
    const rect = el.getBoundingClientRect()
    if (rect.width < 8 || rect.height < 8) return { how: 'ignored' }
    const left = Math.max(rect.left, 1)
    const top = Math.max(rect.top, 1)
    const right = Math.min(rect.right, window.innerWidth - 1)
    const bottom = Math.min(rect.bottom, window.innerHeight - 1)
    if (right - left < 2 || bottom - top < 2) {
      if (rect.width >= 24 && rect.height >= 16) return { obscured: true, how: 'off-screen', by: null }
      return null
    }
    const box = { left, top, right, bottom }
    const covers = stickies().filter((node) => node !== el && !node.contains(el) && !el.contains(node))
    const restore = []
    for (const node of covers) {
      const nodeRect = node.getBoundingClientRect()
      const overlaps = nodeRect.left < box.right && nodeRect.right > box.left && nodeRect.top < box.bottom && nodeRect.bottom > box.top
      if (!overlaps || getComputedStyle(node).pointerEvents !== 'none') continue
      restore.push([node, node.style.pointerEvents])
      node.style.pointerEvents = 'auto'
    }
    const xs = [left + 1, (left + right) / 2, right - 1]
    const ys = [top + 1, (top + bottom) / 2, bottom - 1]
    let visible = 0
    let by = null
    try {
      for (const x of xs) {
        for (const y of ys) {
          const hit = visualHit(x, y)
          if (hit && (hit === el || el.contains(hit) || hit.contains(el))) visible++
          else if (!by && hit) by = describe(hit)
        }
      }
    } finally {
      for (const [node, prev] of restore) node.style.pointerEvents = prev
    }
    if (visible === 0) return { obscured: true, how: 'covered', by }
    return null
  }

  function isTabbable(el) {
    if (hidden(el) || el.disabled) return false
    const tabindex = el.getAttribute('tabindex')
    if (tabindex !== null && Number(tabindex) < 0) return false
    if (el.tagName === 'INPUT' && el.type === 'radio' && el.name) {
      const group = document.querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`)
      const chosen = [...group].find((radio) => radio.checked) || group[0]
      if (chosen !== el) return false
    }
    return true
  }

  const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'

  window.__preflightFocus = {
    prepare() {
      const root = document.documentElement
      const active = document.activeElement
      if (active && active !== root && active !== document.body) active.blur()
      if (!root.hasAttribute('tabindex')) {
        root.setAttribute('tabindex', '-1')
        root.dataset.preflightAddedTabindex = '1'
      }
      root.focus()
      window.scrollTo(0, 0)
    },
    restore() {
      const root = document.documentElement
      if (root.dataset.preflightAddedTabindex) {
        root.removeAttribute('tabindex')
        delete root.dataset.preflightAddedTabindex
      }
    },
    count() {
      return [...document.querySelectorAll(TABBABLE)].filter(isTabbable).length
    },
    snapshot() {
      if (!document.hasFocus()) return { key: null, unfocused: true }
      const el = deepActive()
      if (!el || el === document.body || el === document.documentElement) return { key: null }
      if (el.tagName === 'IFRAME') return { key: null, iframe: true }
      const where = position(el)
      const covered = occlusion(el)
      return {
        key: selector(el),
        name: nameOf(el),
        x: where.x,
        y: where.y,
        obscured: Boolean(covered?.obscured),
        obscuredBy: covered?.by || null,
        how: covered?.how || null,
      }
    },
  }
}

async function settle(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))).catch(() => {})
}

async function snapshot(page) {
  return page.evaluate(() => window.__preflightFocus.snapshot())
}

async function confirmStuck(page, startUrl, stuckKey) {
  const focused = await page.evaluate(() => document.hasFocus())
  if (!focused) return null
  try {
    await page.keyboard.down('Shift')
    await page.keyboard.press('Tab')
  } finally {
    await page.keyboard.up('Shift')
  }
  await settle(page)
  if (page.url() !== startUrl) return null
  const afterShift = await snapshot(page)
  if (!afterShift?.key || afterShift.key !== stuckKey) return null
  await page.keyboard.press('Escape')
  await settle(page)
  if (page.url() !== startUrl) return null
  const afterEsc = await snapshot(page)
  if (!afterEsc?.key || afterEsc.key !== stuckKey) return null
  await page.keyboard.press('Tab')
  await settle(page)
  if (page.url() !== startUrl) return null
  const afterTab = await snapshot(page)
  if (!afterTab?.key || afterTab.key !== stuckKey) return null
  return { via: 'stuck', key: stuckKey, name: afterTab.name || afterEsc.name || '' }
}

async function escapeReleases(page, startUrl, cycleKeys) {
  const inside = new Set(cycleKeys)
  await page.keyboard.press('Escape')
  await settle(page)
  if (page.url() !== startUrl) return true
  const afterEsc = await snapshot(page)
  if (!afterEsc?.key || !inside.has(afterEsc.key)) return true
  await page.keyboard.press('Tab')
  await settle(page)
  if (page.url() !== startUrl) return true
  const afterTab = await snapshot(page)
  return !afterTab?.key || !inside.has(afterTab.key)
}

export async function walkKeyboard(page) {
  const startUrl = page.url()
  await page.bringToFront().catch(() => {})
  await page.evaluate(installFocusProbe)
  await page.evaluate(() => window.__preflightFocus.prepare())
  const tabbableCount = await page.evaluate(() => window.__preflightFocus.count())
  const stops = []
  let prev = null
  let same = 0
  let refocused = false
  let trapped = null
  let cycle = null
  try {
    for (let i = 0; i < TAB_CAP; i++) {
      await page.keyboard.press('Tab')
      await settle(page)
      if (page.url() !== startUrl) break
      const info = await snapshot(page)
      if (info?.iframe) break
      if (!info?.key) {
        if (!refocused) {
          refocused = true
          await page.evaluate(() => window.__preflightFocus.prepare())
          continue
        }
        same++
        if (same >= 2) break
        continue
      }
      if (info.key === prev) {
        same++
        if (same >= 2) {
          trapped = await confirmStuck(page, startUrl, info.key)
          break
        }
        continue
      }
      same = 0
      if (stops.length && info.key === stops[0].key) return { stops, tabbableCount, trapped: null, cycle: null, cycled: true }
      stops.push(info)
      prev = info.key
      const found = repeatedCycle(stops.map((stop) => stop.key))
      if (!found) continue
      const names = found.map((key) => stops.find((stop) => stop.key === key)?.name || key)
      const escaped = await escapeReleases(page, startUrl, found)
      cycle = { keys: found, names, escaped }
      break
    }
    return { stops, tabbableCount, trapped, cycle, cycled: false }
  } finally {
    await page.evaluate(() => window.__preflightFocus && window.__preflightFocus.restore()).catch(() => {})
  }
}
