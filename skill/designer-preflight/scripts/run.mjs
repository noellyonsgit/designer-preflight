#!/usr/bin/env node
// Runs the designer-preflight CLI from wherever it is installed, so the skill works the same in any agent.
// Order: PREFLIGHT_BIN, the repo this skill ships in, `preflight` on PATH, then `npx designer-preflight`.
import { spawnSync, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)

function onPath(bin) {
  try {
    return execFileSync(process.platform === 'win32' ? 'where' : 'which', [bin], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n')[0] || null
  } catch {
    return null
  }
}

function resolveCli() {
  if (process.env.PREFLIGHT_BIN && fs.existsSync(process.env.PREFLIGHT_BIN)) return [process.execPath, [process.env.PREFLIGHT_BIN]]
  const candidates = [path.resolve(here, '../../../src/cli.mjs')]
  const pointer = path.resolve(here, '../cli-location.txt')
  if (fs.existsSync(pointer)) candidates.unshift(fs.readFileSync(pointer, 'utf8').trim())
  try {
    const link = fs.realpathSync(path.resolve(here, '..'))
    candidates.push(path.resolve(link, '../../src/cli.mjs'))
  } catch {
    /* not a symlink */
  }
  const local = candidates.find((p) => fs.existsSync(p) && fs.existsSync(path.resolve(p, '../../node_modules')))
  if (local) return [process.execPath, [local]]
  const global = onPath('preflight')
  if (global) return [global, []]
  return [process.platform === 'win32' ? 'npx.cmd' : 'npx', ['--yes', 'designer-preflight']]
}

const [cmd, prefix] = resolveCli()
const result = spawnSync(cmd, [...prefix, ...args], { stdio: 'inherit' })
if (result.error) {
  process.stderr.write(`Could not run the preflight CLI (${result.error.message}). Install it with: npm install -g designer-preflight\n`)
  process.exit(1)
}
process.exit(result.status ?? 1)
