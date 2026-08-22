import { expect, test } from 'vitest'
import { subset } from '@sprint/core'
import { componentText, insertItems } from './insert'

const qr = { name: 'QrCode', props: [{ name: 'value', type: 'string', required: true }, { name: 'size', type: 'string', required: false }] } as never
const temp = { name: 'temp', props: [{ name: 'value', type: 'number', required: true }] } as never

test('componentText stubs required props with the caret in the first value', () => {
  expect(componentText(qr)).toBe('<QrCode value="|" />')
  expect(componentText(temp)).toBe('<temp :value="|" />')
})

test('the HTML rows are exactly the subset, with its hints and its void/inline shapes', () => {
  const html = insertItems([], [], null).filter((i) => i.kind === 'html')
  expect(html.map((i) => i.name)).toEqual(Object.keys(subset.elements))
  expect(html.map((i) => i.name)).not.toContain('table') // the validator rejects it, so the popup must not offer it
  expect(html.find((i) => i.name === 'div')).toMatchObject({ hint: 'block', text: '<div>\n  |\n</div>' })
  expect(html.find((i) => i.name === 'span')!.text).toBe('<span>|</span>')
  expect(html.find((i) => i.name === 'br')!.text).toBe('<br />|')
})

test('insertItems is context-aware', () => {
  const root = insertItems([qr], [temp], null)
  const names = root.map((i) => i.name)
  expect(names).toContain('QrCode')
  expect(names).toContain('temp')
  expect(names).toContain('div')
  expect(root.find((i) => i.name === 'div')!.illegal).toBeUndefined()
  expect(insertItems([qr], [temp], 'div').map((i) => i.name)).toContain('span')
})

/** No whitelisted element carries nesting rules yet — the mechanism is tested on a stand-in. */
const nested = { ul: { hint: 'list', children: ['li'] }, li: { hint: 'list item', parents: ['ul'] }, div: { hint: 'block' } }

test('nesting rules mute the rows that cannot go here and hide the rest inside a strict parent', () => {
  // `li` stays visible but says why it cannot go here (SPEC §4.8).
  expect(insertItems([qr], [temp], null, nested).find((i) => i.name === 'li')!.illegal).toBe('only inside ul')
  expect(insertItems([qr], [temp], 'ul', nested).find((i) => i.name === 'li')!.illegal).toBeUndefined()
  // Inside a parent that only takes specific children, nothing else is listed — components included.
  expect(insertItems([qr], [temp], 'ul', nested).map((i) => i.name)).toEqual(['li'])
})
