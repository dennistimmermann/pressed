import type { Row } from '../types'

/**
 * What a template reads off `row`, and how a source's fields are bent into that shape.
 * Pure: the Data view checks a mapping with it, and the spoolserver will need the same
 * `applyMapping` before it renders a job.
 */

// ponytail: a regex over the source text, not an AST walk — `row.a.b` is a literal in the
// template, and computed access (`row[key]`) is nothing a mapping UI could offer anyway.
// Swap for the `typescript` package the editor already loads if that ever stops being true.
const PATH = /\brow(?:\.[A-Za-z_$][\w$]*)+/g

/** Every `row.…` path a template reads, deduped and sorted. `?.` counts as `.`. */
export function rowPathsUsed(source: string): string[] {
  return [...new Set(source.replace(/\?\./g, '.').match(PATH) ?? [])].sort()
}

/** `a.b.c` off a row; `undefined` when any step is missing. */
export function getPath(row: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((v, key) => (v == null ? undefined : (v as Row)[key]), row)
}

/**
 * The row a template sees: the source row itself, plus every mapped field copied to the path
 * the template asks for. Identity is the empty mapping — a source whose names already match
 * needs no mapping at all.
 */
export function applyMapping(row: Row, mapping: Record<string, string>): Row {
  const out: Row = { ...row }
  for (const [from, to] of Object.entries(mapping)) {
    const value = getPath(row, from)
    if (value === undefined) continue // nothing there: leave the target alone
    setPath(out, to, value)
  }
  return out
}

/** Copy-on-write down the path, so the source row (and its nested objects) stay untouched. */
function setPath(target: Row, path: string, value: unknown) {
  const keys = path.split('.')
  let node = target
  for (const key of keys.slice(0, -1)) {
    const next = node[key]
    node[key] = next && typeof next === 'object' && !Array.isArray(next) ? { ...(next as Row) } : {}
    node = node[key] as Row
  }
  node[keys[keys.length - 1]] = value
}

/** TypeScript type *text* for a row's actual shape — what the editor types `row` with once a
    mapping has changed it (the source's own `rowType` no longer describes it). */
export function rowTypeOf(row: Row): string {
  const type = (value: unknown): string => {
    if (Array.isArray(value)) return `${type(value[0])}[]`
    if (value && typeof value === 'object')
      return `{ ${Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${type(v)}`).join('; ')} }`
    return value == null ? 'unknown' : typeof value
  }
  return type(row)
}

/**
 * Deterministic mapping suggestions — no fuzzy matching, no scores. For each needed path
 * (without its `row.` prefix) the FIRST of these exact, case-insensitive name matches wins:
 *   1. the full path            (`filament.diameter`)
 *   2. the path with `_`        (`filament_diameter`)
 *   3. the last segment         (`diameter`)
 *   4. the parent segment, when the leaf is `name` (`vendor` → `filament.vendor.name`)
 * A source field is used at most once; a path with two candidates in the same rule is
 * skipped rather than guessed. Already-mapped fields and already-satisfied paths are left
 * alone by the caller.
 */
export function suggestMappings(neededPaths: string[], sourceFields: string[]): Record<string, string> {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '')
  const free = new Set(sourceFields)
  const out: Record<string, string> = {}
  for (const rowPath of [...neededPaths].sort()) {
    const path = rowPath.replace(/^row\./, '')
    const segs = path.split('.')
    const names = [path, path.replaceAll('.', '_'), segs[segs.length - 1]]
    if (segs[segs.length - 1] === 'name' && segs.length > 1) names.push(segs[segs.length - 2])
    for (const name of names) {
      const hits = [...free].filter((f) => norm(f) === norm(name))
      if (hits.length === 1) { out[hits[0]] = path; free.delete(hits[0]); break }
      if (hits.length > 1) break // ambiguous: skip, never guess
    }
  }
  return out
}
