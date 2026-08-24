import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'

/**
 * Architecture guardrails (CODE_REVIEW DOC-02): the dependency directions most likely to
 * regress, as one executable check instead of comments. Rules mirror CLAUDE.md's Boundaries.
 */
const root = join(import.meta.dirname, '../../..')

function* files(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* files(path)
    else if (/\.(ts|vue)$/.test(entry.name)) yield path
  }
}

function imports(path: string): string[] {
  const source = readFileSync(path, 'utf8')
  return [...source.matchAll(/(?:from|import)\s*\(?\s*'([^']+)'/g)].map((m) => m[1])
}

test('import boundaries hold', () => {
  const violations: string[] = []
  const check = (target: string, bad: (spec: string) => boolean, rule: string) => {
    const path = join(root, target)
    for (const file of target.endsWith('.ts') ? [path] : files(path))
      for (const spec of imports(file))
        if (bad(spec)) violations.push(`${file.slice(root.length + 1)} → '${spec}' (${rule})`)
  }

  // core is DOM-free and app-free: it must keep running in Node (CLAUDE.md).
  check('packages/core/src', (s) => s.includes('apps/') || s.startsWith('@/'), 'core must not import the app')
  // the data domain answers mapping questions without reaching into editor UI internals (ARC-02).
  check('apps/web/src/stores/data.ts', (s) => s.startsWith('@/editor'), 'data must not import editor internals')
  // printer adapters receive config as arguments; they never read app stores (ARC-03).
  check('apps/web/src/printers', (s) => s.startsWith('@/stores/'), 'printers must not import stores')
  // stores must stay mountable in Node tests: no component imports.
  check('apps/web/src/stores', (s) => s.endsWith('.vue') && !s.endsWith('?raw'), 'stores must not import components')

  expect(violations, violations.join('\n')).toEqual([])
})
