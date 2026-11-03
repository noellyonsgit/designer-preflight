import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { launchBrowser } from '../src/browser.mjs'
import { judgeWalk, walkKeyboard } from '../src/checks/keyboard.mjs'
import { chromePath } from '../src/util.mjs'

const chrome = chromePath()

describe('keyboard walk in Chrome', { skip: chrome ? false : 'Chrome is not installed' }, () => {
  let browser

  before(async () => {
    browser = await launchBrowser()
  })

  after(async () => {
    await browser?.close()
  })

  async function open(html) {
    const page = await browser.newPage()
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
    await page.setContent(html, { waitUntil: 'load' })
    return page
  }

  async function judge(html) {
    const page = await open(html)
    try {
      return judgeWalk(await walkKeyboard(page))
    } finally {
      await page.close()
    }
  }

  test('a fixed bar that covers a control is reported', { timeout: 30_000 }, async () => {
    const judged = await judge(`<!doctype html><html><head><style>
      header { position: fixed; top: 0; left: 0; right: 0; height: 80px; background: #fff; z-index: 5; }
      a { display: block; height: 40px; }
      .below { margin-top: 120px; }
    </style></head><body style="margin:0">
      <header class="bar">Sticky</header>
      <a href="#one">Hidden link</a>
      <a class="below" href="#two">Visible link</a>
    </body></html>`)
    assert.equal(judged.trap, null)
    assert.ok(judged.obscured.some((stop) => stop.name === 'Hidden link' && stop.how === 'covered'), JSON.stringify(judged.obscured))
    assert.ok(!judged.obscured.some((stop) => stop.name === 'Visible link'), JSON.stringify(judged.obscured))
  })

  test('content that starts below a fixed bar is not reported', { timeout: 30_000 }, async () => {
    const judged = await judge(`<!doctype html><html><head><style>
      header { position: fixed; top: 0; left: 0; right: 0; height: 80px; background: #fff; z-index: 5; }
      main { padding-top: 96px; }
      a { display: block; height: 40px; }
    </style></head><body style="margin:0">
      <header class="bar">Sticky</header>
      <main>
        <a href="#one">First</a>
        <a href="#two">Second</a>
      </main>
    </body></html>`)
    assert.deepEqual(judged.obscured, [], JSON.stringify(judged))
    assert.equal(judged.trap, null)
  })

  test('a control that swallows Tab and Escape is a trap', { timeout: 30_000 }, async () => {
    const judged = await judge(`<!doctype html><body>
      <a href="#other">Other</a>
      <button id="trap">Stuck</button>
      <a href="#after">After</a>
      <script>
        document.getElementById('trap').addEventListener('keydown', (event) => {
          if (event.key === 'Tab' || event.key === 'Escape') event.preventDefault()
        })
      </script>
    </body></html>`)
    assert.equal(judged.trap && judged.trap.name, 'Stuck', JSON.stringify(judged))
  })

  test('a trap on the last control is still a trap', { timeout: 30_000 }, async () => {
    const judged = await judge(`<!doctype html><body>
      <a href="#other">Other</a>
      <button id="trap">Stuck</button>
      <script>
        document.getElementById('trap').addEventListener('keydown', (event) => {
          if (event.key === 'Tab' || event.key === 'Escape') event.preventDefault()
        })
      </script>
    </body></html>`)
    assert.equal(judged.trap && judged.trap.name, 'Stuck', JSON.stringify(judged))
  })

  test('a dialog that closes on Escape is not a trap', { timeout: 30_000 }, async () => {
    const judged = await judge(`<!doctype html><body>
      <button id="page">Page</button>
      <div id="box" role="dialog">
        <button id="a">Stay A</button>
        <button id="b">Stay B</button>
      </div>
      <script>
        document.getElementById('box').addEventListener('keydown', (event) => {
          const a = document.getElementById('a')
          const b = document.getElementById('b')
          if (event.key === 'Escape') {
            event.preventDefault()
            document.getElementById('page').focus()
            return
          }
          if (event.key !== 'Tab') return
          if (event.shiftKey && document.activeElement === a) { event.preventDefault(); b.focus() }
          if (!event.shiftKey && document.activeElement === b) { event.preventDefault(); a.focus() }
        })
      </script>
    </body></html>`)
    assert.equal(judged.trap, null, JSON.stringify(judged))
    assert.equal(judged.cycle, null, JSON.stringify(judged))
  })

  test('reading order is not a jump, and a reversed stack is', { timeout: 30_000 }, async () => {
    const ordered = await judge(`<!doctype html><body>
      <button>One</button><br><button>Two</button><br><button>Three</button><br><button>Four</button>
    </body></html>`)
    assert.deepEqual(ordered.jumps, [], JSON.stringify(ordered))
    assert.equal(ordered.trap, null)

    const reversed = await judge(`<!doctype html><body style="margin:0">
      <button style="position:absolute;top:500px;left:20px">Bottom</button>
      <button style="position:absolute;top:40px;left:20px">Top</button>
      <button style="position:absolute;top:120px;left:20px">Mid</button>
      <button style="position:absolute;top:200px;left:20px">Lower</button>
    </body></html>`)
    assert.equal(reversed.jumps[0] && reversed.jumps[0].kind, 'up', JSON.stringify(reversed.jumps))
    assert.equal(reversed.jumps[0].from, 'Bottom')
    assert.equal(reversed.jumps[0].to, 'Top')
  })
})
