import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { focusJumps, judgeWalk, repeatedCycle } from '../src/checks/keyboard.mjs'

const stop = (key, x, y, extra = {}) => ({ key, name: key, x, y, obscured: false, how: null, ...extra })

describe('repeatedCycle', () => {
  test('a full pass that repeats is the page wrapping, not a trap', () => {
    assert.equal(repeatedCycle(['A', 'B', 'A', 'B']), null)
  })

  test('a group that repeats after other controls is a cycle', () => {
    assert.deepEqual(repeatedCycle(['Page', 'A', 'B', 'A', 'B']), ['A', 'B'])
  })

  test('one repeat of a single key is not a group cycle', () => {
    assert.equal(repeatedCycle(['A', 'B', 'B']), null)
  })
})

describe('focusJumps', () => {
  test('a short column then a column to the right is not a jump', () => {
    const stops = [
      stop('a', 0, 0),
      stop('b', 0, 40),
      stop('c', 0, 80),
      stop('d', 0, 120),
      stop('e', 220, 0),
    ]
    assert.deepEqual(focusJumps(stops), [])
  })

  test('tabbing into the footer before the main controls is a jump', () => {
    const stops = [stop('Home', 0, 0), stop('About', 80, 0), stop('Footer', 0, 900), stop('Main', 0, 200)]
    const jumps = focusJumps(stops)
    const skip = jumps.find((jump) => jump.kind === 'skip')
    assert.ok(skip, JSON.stringify(jumps))
    assert.equal(skip.from, 'About')
    assert.equal(skip.to, 'Footer')
    assert.equal(skip.nearer, 'Main')
  })

  test('a leap back up the same column is a jump', () => {
    const stops = [stop('Bottom', 20, 500), stop('Top', 20, 40), stop('Mid', 20, 120), stop('Lower', 20, 200)]
    const jumps = focusJumps(stops)
    assert.equal(jumps[0].kind, 'up')
    assert.equal(jumps[0].from, 'Bottom')
    assert.equal(jumps[0].to, 'Top')
  })

  test('controls in reading order are not jumps', () => {
    const stops = [stop('One', 20, 20), stop('Two', 20, 70), stop('Three', 20, 120), stop('Four', 20, 170)]
    assert.deepEqual(focusJumps(stops), [])
  })
})

describe('judgeWalk', () => {
  test('the only control on the page is not a trap', () => {
    const judged = judgeWalk({
      stops: [stop('Only', 0, 0)],
      tabbableCount: 1,
      trapped: { via: 'stuck', key: 'Only', name: 'Only' },
      cycle: null,
    })
    assert.equal(judged.trap, null)
  })

  test('a control that will not release focus, with others on the page, is a trap', () => {
    const judged = judgeWalk({
      stops: [stop('Other', 0, 0), stop('Stuck', 0, 40)],
      tabbableCount: 2,
      trapped: { via: 'stuck', key: 'Stuck', name: 'Stuck' },
      cycle: null,
    })
    assert.equal(judged.trap.name, 'Stuck')
  })

  test('a dialog that Escape closes is not reported', () => {
    const judged = judgeWalk({
      stops: [stop('Page', 0, 0), stop('A', 0, 40), stop('B', 0, 80)],
      tabbableCount: 4,
      trapped: null,
      cycle: { keys: ['A', 'B'], names: ['A', 'B'], escaped: true },
    })
    assert.equal(judged.cycle, null)
    assert.equal(judged.trap, null)
  })

  test('a cycle Escape does not leave is kept for a person to check', () => {
    const judged = judgeWalk({
      stops: [stop('Page', 0, 0), stop('A', 0, 40), stop('B', 0, 80), stop('A', 0, 40), stop('B', 0, 80)],
      tabbableCount: 4,
      trapped: null,
      cycle: { keys: ['A', 'B'], names: ['A', 'B'], escaped: false },
    })
    assert.deepEqual(judged.cycle.keys, ['A', 'B'])
  })

  test('a covered control is reported once', () => {
    const covered = stop('Account', 0, 0, { obscured: true, how: 'covered', obscuredBy: 'header.bar' })
    const judged = judgeWalk({
      stops: [covered, covered, stop('Later', 0, 200)],
      tabbableCount: 2,
      trapped: null,
      cycle: null,
    })
    assert.equal(judged.obscured.length, 1)
    assert.equal(judged.obscured[0].obscuredBy, 'header.bar')
  })
})
