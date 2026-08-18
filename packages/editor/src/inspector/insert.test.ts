import { expect, test } from 'vitest'
import { componentText, insertItems } from './insert'

const qr = { name: 'QrCode', props: [{ name: 'value', type: 'string', required: true }, { name: 'size', type: 'string', required: false }] } as never
const temp = { name: 'temp', props: [{ name: 'value', type: 'number', required: true }] } as never

test('componentText stubs required props with the caret in the first value', () => {
  expect(componentText(qr)).toBe('<QrCode value="|" />')
  expect(componentText(temp)).toBe('<temp :value="|" />')
})

test('insertItems is context-aware', () => {
  const root = insertItems([qr], [temp], null).map((i) => i.name)
  expect(root).toContain('QrCode')
  expect(root).toContain('div')
  expect(root).not.toContain('li') // li needs a list parent
  expect(insertItems([qr], [temp], 'ul').map((i) => i.name)).toEqual(['li'])
  expect(insertItems([qr], [temp], 'tr').map((i) => i.name)).toEqual(['td', 'th'])
  expect(insertItems([qr], [temp], 'div').map((i) => i.name)).toContain('span')
})
