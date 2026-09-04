import { expect, it } from 'vitest'
import { iconSnippetBody, iconSnippetName } from './snippet'

const icon = { name: 'recycle', viewBox: '0 0 24 24', body: '<path d="M4 7h16"/>' }

it('prefixes the snippet name — the prefix is what makes it an icon', () => {
  expect(iconSnippetName(icon.name)).toBe('icon-recycle')
})

it('writes a shorthand body sized in millimetres', () => {
  expect(iconSnippetBody(icon)).toBe('<svg viewBox="0 0 24 24" width="4mm" height="4mm">\n  <path d="M4 7h16"/>\n</svg>')
})
