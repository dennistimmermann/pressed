// @vitest-environment happy-dom
import { expect, it } from 'vitest'
import { pressed } from './pressed'
import { sanitizeSvg } from './sanitize'

it('every Pressed icon is unique, in both dialects, and already in sanitised form', async () => {
  const icons = await pressed.load()
  const names = icons.map((i) => i.name)
  expect(new Set(names).size).toBe(names.length)
  // Each line icon has its filled twin — the catalogue promises both.
  for (const name of names.filter((n) => !n.endsWith('-filled'))) expect(names).toContain(`${name}-filled`)
  for (const icon of icons) expect(sanitizeSvg(icon.body)).toEqual({ body: icon.body })
})
