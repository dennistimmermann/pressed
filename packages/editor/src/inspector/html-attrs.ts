/**
 * The handful of HTML attributes worth offering in the property editor when the caret sits on
 * a plain element. Not a schema — HTML has hundreds of attributes and a text field for the
 * rest is a better deal than a table nobody maintains.
 */
const PER_TAG: Record<string, string[]> = {
  img: ['src', 'alt', 'width', 'height'],
  a: ['href', 'target'],
}

const COMMON = ['class', 'style', 'id']

export function htmlAttrsFor(tag: string): string[] {
  return [...(PER_TAG[tag.toLowerCase()] ?? []), ...COMMON]
}
