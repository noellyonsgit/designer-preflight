import fs from 'node:fs'
import path from 'node:path'
import { localBin, run as exec, tail } from '../util.mjs'

export const name = 'build'
export const phases = ['health']

function runner(stack) {
  const pm = stack.packageManager || 'npm'
  return (script) => (pm === 'npm' ? { cmd: 'npm', args: ['run', script, '--silent'] } : { cmd: pm, args: ['run', script] })
}

function failed(id, label, result, why, fix, severity = 'P0') {
  return {
    id,
    phase: 'health',
    severity,
    confidence: 'verified',
    what: `${label} fails${result.timedOut ? ' (timed out)' : ''}.`,
    why,
    fix,
    effort: '30 min',
    evidence: tail(result.out, 12),
    evidenceKey: label,
    source: ['preflight'],
  }
}

export async function run(ctx) {
  const { root, stack } = ctx
  const findings = []
  if (!stack.hasPackageJson) return findings

  const engines = stack.pkg.engines?.node
  const pinned = engines || ['.nvmrc', '.node-version', '.tool-versions'].some((f) => fs.existsSync(path.join(root, f)))
  if (!pinned) {
    findings.push({
      id: 'build.node-version-unpinned',
      phase: 'health',
      severity: 'P2',
      confidence: 'verified',
      file: 'package.json',
      what: 'The project does not say which Node.js version it needs.',
      why: 'Your hosting provider may build with a different Node.js version than your laptop, and a build that works locally can then fail or behave differently in production.',
      fix: 'Add "engines": { "node": ">=20" } to package.json (match the version you use locally, `node -v`), or add an .nvmrc file.',
      effort: '5 min',
      source: ['preflight'],
    })
  }

  if (!stack.installed) {
    ctx.notChecked.push('Build, typecheck and lint: dependencies are not installed, so they could not run. Install them (for example `npm install`) and re-run.')
    findings.push({
      id: 'build.not-installed',
      phase: 'health',
      severity: 'P1',
      confidence: 'verified',
      what: 'Dependencies are not installed, so the build, typecheck and lint could not be checked.',
      why: 'Until the project builds cleanly from a fresh install, nobody can be sure it will build on the server that publishes it.',
      fix: `Run \`${stack.packageManager || 'npm'} install\`, then run the pre-flight again.`,
      effort: '5 min',
      source: ['preflight'],
    })
    return findings
  }
  if (ctx.options.build === false) {
    ctx.notChecked.push('Build, typecheck and lint were skipped (--no-build).')
    return findings
  }

  const script = runner(stack)
  const scripts = stack.scripts

  if (stack.framework.id === 'next' && (stack.framework.major ?? 0) >= 16 && /\bnext lint\b/.test(scripts.lint || '')) {
    findings.push({
      id: 'build.next-lint-removed',
      phase: 'health',
      severity: 'P1',
      confidence: 'verified',
      file: 'package.json',
      what: 'The lint script still calls `next lint`, which Next.js 16 removed.',
      why: 'Linting silently stops running, so mistakes it would catch reach your users. Next.js 16 also no longer lints during `next build`.',
      fix: 'Run `npx @next/codemod@canary next-lint-to-eslint-cli .` to switch the script to `eslint .`.',
      effort: '5 min',
      source: ['https://nextjs.org/docs/app/guides/upgrading/version-16'],
    })
  }

  if (stack.typescript) {
    const tsc = localBin(root, 'tsc')
    const typecheck = scripts.typecheck ? script('typecheck') : scripts['type-check'] ? script('type-check') : tsc && fs.existsSync(path.join(root, 'tsconfig.json')) ? { cmd: tsc, args: ['--noEmit', '-p', '.'] } : null
    if (typecheck) {
      const res = await exec(typecheck.cmd, typecheck.args, { cwd: root, timeoutMs: 300_000 })
      ctx.log(`typecheck exited ${res.code}`)
      if (res.code !== 0) {
        const count = (res.out.match(/error TS\d+/g) || []).length
        findings.push({
          ...failed('build.typecheck', 'The TypeScript check', res, `TypeScript found ${count || 'some'} place(s) where the code does not fit together, such as a value being used as the wrong type. These often become crashes for particular users or screens.`, 'Ask your agent to fix the TypeScript errors one file at a time and re-run the check after each.', 'P1'),
        })
      }
    }
  }

  const lint = scripts.lint && !/\bnext lint\b/.test(scripts.lint) ? script('lint') : stack.linter === 'biome' && localBin(root, 'biome') ? { cmd: localBin(root, 'biome'), args: ['check', '.'] } : stack.linter === 'eslint' && localBin(root, 'eslint') ? { cmd: localBin(root, 'eslint'), args: ['.'] } : null
  if (lint) {
    const res = await exec(lint.cmd, lint.args, { cwd: root, timeoutMs: 300_000 })
    ctx.log(`lint exited ${res.code}`)
    if (res.code !== 0) {
      const problems = res.out.match(/(\d+)\s+problems?/)?.[1]
      findings.push(failed('build.lint', 'The linter', res, `The linter flagged ${problems || 'some'} problem(s). Linters catch things like hooks used in the wrong place, unused code and accessibility mistakes in markup.`, 'Run the lint fixer first (for example `npm run lint -- --fix`), then fix what is left by hand.', 'P1'))
    }
  } else {
    findings.push({
      id: 'build.no-linter',
      phase: 'health',
      severity: 'P2',
      confidence: 'verified',
      file: 'package.json',
      what: 'No linter is set up.',
      why: 'A linter is a spell-checker for code. Without one, common mistakes (including some accessibility ones) are only found by users.',
      fix: stack.framework.id === 'next' ? 'Add ESLint with `eslint-config-next` (see the Next.js ESLint docs).' : 'Add ESLint or Biome with the recommended rules for your framework.',
      effort: '30 min',
      source: ['preflight'],
    })
  }

  if (scripts.build) {
    const res = await exec(script('build').cmd, script('build').args, { cwd: root, timeoutMs: 600_000, env: { NODE_ENV: 'production' } })
    ctx.log(`build exited ${res.code}`)
    ctx.buildOutput = res.out
    ctx.built = res.code === 0
    if (res.code !== 0) {
      findings.push(failed('build.build', 'The production build', res, 'If the project does not build, it cannot be published, and any hosting provider will reject the deploy.', 'Read the first error in the output above; it is usually the real cause and later errors follow from it. Fix it and re-run the build.'))
    } else {
      const warnings = (res.out.match(/^.*\bwarn(?:ing)?\b.*$/gim) || []).filter((l) => !/deprecat|browserslist|npm warn/i.test(l))
      if (warnings.length) {
        findings.push({
          id: 'build.warnings',
          phase: 'health',
          severity: 'P2',
          confidence: 'needs-human',
          what: `The build succeeded with ${warnings.length} warning(s).`,
          why: 'Build warnings are early signs of problems such as very large bundles or code that behaves differently in production.',
          fix: 'Read each warning; fix the ones that mention size, hydration, missing dependencies or unsupported features.',
          effort: '30 min',
          evidence: warnings.slice(0, 8).join('\n'),
          source: ['preflight'],
        })
      }
    }
  } else if (!['static', 'node'].includes(stack.framework.id)) {
    ctx.notChecked.push('Production build: package.json has no "build" script.')
  }

  if (scripts.test && !/no test specified/.test(scripts.test)) {
    const res = await exec(script('test').cmd, script('test').args, { cwd: root, timeoutMs: 600_000 })
    ctx.log(`tests exited ${res.code}`)
    if (res.code !== 0) findings.push(failed('build.tests', 'The test suite', res, 'Failing tests mean something the project once promised to do no longer works, or the tests are out of date. Either way they no longer protect you.', 'Fix or update the failing tests before changing anything else, so they can catch regressions from the clean-up.', 'P1'))
  } else {
    findings.push({
      id: 'build.no-tests',
      phase: 'health',
      severity: 'P2',
      confidence: 'verified',
      what: 'The project has no automated tests.',
      why: 'Without tests, the only proof a change did not break something is clicking through every screen. The pre-flight\'s before-and-after screenshots cover how screens look, not whether forms and buttons still work.',
      fix: 'Ask your agent to add a few end-to-end tests for the main journeys (for example sign-up and checkout) before refactoring.',
      effort: 'half a day',
      source: ['preflight'],
    })
  }
  return findings
}
