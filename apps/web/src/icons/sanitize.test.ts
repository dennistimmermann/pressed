// @vitest-environment happy-dom
import { expect, it } from 'vitest'
import { fromIconify, fromSvg } from './iconify'
import { sanitizeSvg } from './sanitize'

/** A real Tabler outline body — the shape ~6,200 of them share. */
const TABLER = '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 16v-5.5a2.5 2.5 0 0 1 5 0V16m0-4H3"/>'

const body = (markup: string) => {
  const out = sanitizeSvg(markup)
  if ('reason' in out) throw new Error(out.reason)
  return out.body
}
const reason = (markup: string) => {
  const out = sanitizeSvg(markup)
  return 'reason' in out ? out.reason : null
}

it('passes a Tabler body through byte-identical', () => {
  expect(body(TABLER)).toBe(TABLER)
})

it('drops <title> silently and keeps the icon', () => {
  expect(body('<title>Recycle</title><path d="M4 7h16"/>')).toBe('<path d="M4 7h16"/>')
})

it('rejects an element outside the subset, naming the tag', () => {
  expect(reason('<ellipse cx="1" cy="2" rx="3" ry="4"/>')).toBe('uses <ellipse> — not in the render subset')
  expect(reason('<defs><path d="M0 0"/></defs><path d="M4 7h16"/>')).toBe('uses <defs> — not in the render subset')
})

it('strips handlers, links, style and url() values — and rejects <script> outright', () => {
  expect(body('<path onclick="alert(1)" href="javascript:alert(1)" style="fill:red" fill="url(#g)" d="M4 7h16"/>')).toBe('<path d="M4 7h16"/>')
  expect(reason('<script>alert(1)</script><path d="M4 7h16"/>')).toBe('uses <script> — not in the render subset')
})

it('never wraps the output in a root <svg>', () => {
  expect(body('<g><path d="M4 7h16"/></g>')).toBe('<g><path d="M4 7h16"/></g>')
})

it('fromIconify: viewBox from the set, then the icon, then the default', () => {
  const out = fromIconify({
    width: 24,
    height: 24,
    icons: {
      plain: { body: TABLER },
      offset: { body: TABLER, left: 1, top: 2, width: 32, height: 48 },
      bad: { body: '<ellipse cx="1" cy="2" rx="3" ry="4"/>' },
    },
    aliases: { copy: { parent: 'plain' }, flipped: { parent: 'plain', hFlip: true } },
  })
  expect(out.icons.map((i) => [i.name, i.viewBox])).toEqual([
    ['plain', '0 0 24 24'],
    ['offset', '1 2 32 48'],
    ['copy', '0 0 24 24'], // an alias is the parent under another name; a transformed one is dropped
  ])
  expect(out.rejected).toEqual([{ name: 'bad', reason: 'uses <ellipse> — not in the render subset' }])
  expect(fromIconify({ icons: { x: { body: TABLER } } }).icons[0].viewBox).toBe('0 0 16 16')
})

it('fromSvg: carries the root presentation attributes onto a wrapping <g>', () => {
  const out = fromSvg('My Icon', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="x"><path d="M4 7h16"/></svg>')
  expect(out).toEqual({
    icon: { name: 'my-icon', viewBox: '0 0 24 24', body: '<g fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16"/></g>' },
  })
})

it('fromSvg: falls back to width/height for the viewBox, and rejects without either', () => {
  const sized = fromSvg('a', '<svg width="48" height="16px"><path d="M4 7h16"/></svg>')
  expect(sized).toEqual({ icon: { name: 'a', viewBox: '0 0 48 16', body: '<path d="M4 7h16"/>' } })
  expect(fromSvg('a', '<svg><path d="M4 7h16"/></svg>')).toEqual({ reason: 'has no viewBox and no width/height' })
  expect(fromSvg('…', '<svg viewBox="0 0 1 1"/>')).toEqual({ reason: '“…” is not usable as a tag name' })
})
