import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { componentRole, driftFindings, variantPropsIn } from '../src/checks/design-drift.mjs'

function project(files) {
  return {
    matching(re) {
      return Object.keys(files).filter((file) => re.test(file))
    },
    text(file) {
      return files[file] ?? null
    },
  }
}

const tokens = { 'src/index.css': ':root { --brand: #ff5a1f; --spacing-4: 1rem; }\n' }

describe('colours and spacing outside tokens', () => {
  test('a typed colour in a component is reported when tokens exist', () => {
    const findings = driftFindings(project({ ...tokens, 'src/Header.jsx': '<a className="text-[#ff5a1f]">Studio</a>\n' }), { tailwind: null })
    const colour = findings.find((finding) => finding.id === 'design.colours-outside-tokens')
    assert.ok(colour, JSON.stringify(findings))
    assert.match(colour.what, /#ff5a1f/)
  })

  test('the token file itself is not reported', () => {
    const findings = driftFindings(project(tokens), { tailwind: null })
    assert.equal(findings.find((finding) => finding.id === 'design.colours-outside-tokens'), undefined)
  })

  test('typed colours are not drift when the project has no tokens', () => {
    const findings = driftFindings(project({ 'src/Header.jsx': '<a className="text-[#ff5a1f]">Studio</a>\n' }), { tailwind: null })
    assert.equal(findings.find((finding) => finding.id === 'design.colours-outside-tokens'), undefined)
  })

  test('black, white, hairlines and non-spacing pixels are left alone', () => {
    const findings = driftFindings(project({
      ...tokens,
      'src/Icon.jsx': '<svg fill="#fff" />\n<div style={{ borderWidth: 2, width: 13, padding: 1 }} className="w-[13px] scroll-margin-top: 12px" />\n',
    }), { tailwind: { major: 4 } })
    assert.equal(findings.find((finding) => finding.id === 'design.colours-outside-tokens'), undefined)
    assert.equal(findings.find((finding) => finding.id === 'design.spacing-outside-tokens'), undefined)
  })

  test('pixel padding and arbitrary spacing are reported when a scale exists', () => {
    const findings = driftFindings(project({
      'src/index.css': '@import "tailwindcss";\n',
      'src/Card.jsx': '<div style={{ padding: 16 }} className="mt-[12px]" />\n',
    }), { tailwind: { major: 4 } })
    const spacing = findings.find((finding) => finding.id === 'design.spacing-outside-tokens')
    assert.ok(spacing, JSON.stringify(findings))
    assert.match(spacing.evidence, /padding: 16/)
    assert.match(spacing.evidence, /mt-\[12px\]/)
  })

  test('a CSS module counts as the component', () => {
    const findings = driftFindings(project({
      ...tokens,
      'src/Card.module.css': '.card { color: #3366ff; padding: 18px; }\n',
    }), { tailwind: null })
    assert.ok(findings.some((finding) => finding.id === 'design.colours-outside-tokens'))
    assert.ok(findings.some((finding) => finding.id === 'design.spacing-outside-tokens'))
  })

  test('pixel padding is not drift without a spacing scale', () => {
    const findings = driftFindings(project({ 'src/Card.jsx': '<div style={{ padding: 16 }} />\n' }), { tailwind: null })
    assert.equal(findings.find((finding) => finding.id === 'design.spacing-outside-tokens'), undefined)
  })
})

describe('overlapping components', () => {
  test('Button and PrimaryButton that both take variant are the same control', () => {
    assert.equal(componentRole('src/components/Button.tsx'), 'button')
    assert.equal(componentRole('src/components/PrimaryButton.tsx'), 'button')
    assert.equal(componentRole('src/components/SubmitButton.tsx'), null)
    assert.deepEqual(variantPropsIn('export function PrimaryButton({ variant, size }) { return null }\n', 'PrimaryButton').sort(), ['size', 'variant'])
    const findings = driftFindings(project({
      'src/Button.tsx': 'export function Button({ variant, children }) { return null }\n',
      'src/PrimaryButton.tsx': 'export function PrimaryButton({ variant }) { return null }\n',
      'src/IconButton.tsx': 'export function IconButton({ icon }) { return null }\n',
      'src/SubmitButton.tsx': 'export function SubmitButton({ variant }) { return null }\n',
    }), { tailwind: null })
    const overlap = findings.filter((finding) => finding.id === 'design.overlapping-components')
    assert.equal(overlap.length, 1)
    assert.match(overlap[0].what, /Button and PrimaryButton/)
    assert.doesNotMatch(overlap[0].what, /IconButton/)
    assert.match(overlap[0].what, /variant/)
  })

  test('two buttons with no shared setting are not reported', () => {
    const findings = driftFindings(project({
      'src/Button.tsx': 'export function Button({ children }) { return null }\n',
      'src/IconButton.tsx': 'export function IconButton({ icon }) { return null }\n',
    }), { tailwind: null })
    assert.equal(findings.find((finding) => finding.id === 'design.overlapping-components'), undefined)
  })

  test('Button and ButtonOld are left to the copy check', () => {
    const findings = driftFindings(project({
      'src/Button.tsx': 'export function Button({ variant }) { return null }\n',
      'src/ButtonOld.tsx': 'export function ButtonOld({ variant }) { return null }\n',
    }), { tailwind: null })
    assert.equal(findings.find((finding) => finding.id === 'design.overlapping-components'), undefined)
  })

  test('a folder named Button counts', () => {
    assert.equal(componentRole('src/components/Button/index.tsx'), 'button')
  })
})
