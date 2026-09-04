/**
 * An icon is markup, not data: it ends up in the template as a `<snippet name="icon-*">`.
 * The shape is Iconify's, because that is the interchange format every catalogue speaks.
 */
export type Icon = {
  name: string
  viewBox: string
  /** *Sanitised* inner SVG markup — never a root `<svg>`. */
  body: string
}

/** A catalogue. Uniformly async: Tabler lazy-imports its JSON, Mine reads IndexedDB, Pressed resolves at once. */
export type IconSet = {
  id: 'tabler' | 'mine' | 'pressed'
  label: string
  load(): Promise<Icon[]>
}

/** Why one icon did not make it in — listed inline under the grid, never a toast (invariant 5). */
export type Rejection = { name: string; reason: string }
