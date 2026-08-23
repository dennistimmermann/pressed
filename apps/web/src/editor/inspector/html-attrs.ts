import { subset } from '@pressed/core'

/**
 * The handful of HTML attributes worth offering in the property editor when the caret sits on
 * a plain element. Not a schema — HTML has hundreds of attributes and a text field for the
 * rest is a better deal than a table nobody maintains. The per-tag ones live with the tag in
 * the render subset (`img` → src/alt/width/height), so there is one list, not two.
 */
const COMMON = ['class', 'style', 'id']

export function htmlAttrsFor(tag: string): string[] {
  return [...(subset.elements[tag.toLowerCase()]?.attrs ?? []), ...COMMON]
}
