#!/usr/bin/env node
// Installs the designer-preflight skill where each agent looks for skills:
//   ~/.agents/skills   Codex and Cursor
//   ~/.claude/skills   Claude Code (and Cursor, which reads it too)
// Usage: node scripts/install-skill.mjs [--project <folder>] [--copy] [--force] [--uninstall]
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.join(repo, 'skill', 'designer-preflight')
const args = process.argv.slice(2)
const flag = (name) => args.includes(`--${name}`)
const projectIndex = args.indexOf('--project')
const base = projectIndex >= 0 ? path.resolve(args[projectIndex + 1] || '.') : os.homedir()
const copy = flag('copy') || process.platform === 'win32'
const targets = [path.join(base, '.agents', 'skills', 'designer-preflight'), path.join(base, '.claude', 'skills', 'designer-preflight')]

function remove(target) {
  const stat = fs.lstatSync(target, { throwIfNoEntry: false })
  if (!stat) return false
  if (stat.isSymbolicLink() || flag('force') || fs.existsSync(path.join(target, '.installed-by-preflight'))) {
    fs.rmSync(target, { recursive: true, force: true })
    return true
  }
  throw new Error(`${target} already exists and was not installed by this script. Re-run with --force to replace it.`)
}

for (const target of targets) {
  const existed = remove(target)
  if (flag('uninstall')) {
    console.log(existed ? `Removed ${target}` : `Nothing to remove at ${target}`)
    continue
  }
  fs.mkdirSync(path.dirname(target), { recursive: true })
  if (copy) {
    fs.cpSync(source, target, { recursive: true })
    fs.writeFileSync(path.join(target, 'cli-location.txt'), path.join(repo, 'src', 'cli.mjs') + '\n')
    fs.writeFileSync(path.join(target, '.installed-by-preflight'), new Date().toISOString() + '\n')
    console.log(`Copied the skill to ${target}`)
  } else {
    fs.symlinkSync(source, target, 'dir')
    console.log(`Linked ${target} -> ${source}`)
  }
}

if (!flag('uninstall')) {
  console.log(`
Installed. Open a project in Claude Code, Codex or Cursor and ask:
  "Run a pre-flight check on this project"
${copy ? '\nThis is a copy: run this installer again after updating the repo.' : '\nThis is a link, so pulling updates to the repo updates the skill too.'}`)
}
