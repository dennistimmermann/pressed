import { expect, test } from 'vitest'
import { CODE128_TABLE, code128bBars, code128bValues } from './code128'

test('the Code 128 pattern table has no typos', () => {
  expect(CODE128_TABLE).toHaveLength(107)
  const sum = (p: string) => [...p].reduce((a, d) => a + +d, 0)
  // Every symbol is 11 modules wide; the stop symbol (106) is 13 and has a seventh element.
  expect(CODE128_TABLE.slice(0, 106).every((p) => p.length === 6 && sum(p) === 11)).toBe(true)
  expect(CODE128_TABLE[106]).toBe('2331112')
})

test('start, data, mod-103 checksum, stop', () => {
  // 'A' = 65 - 32 = 33; check = (104 * 1 + 33 * 1) % 103 = 34.
  expect(code128bValues('A')).toEqual([104, 33, 34, 106])
  const { bars, modules } = code128bBars('A')
  expect(modules).toBe(11 * 3 + 13)
  expect(bars[0]).toEqual({ x: 0, width: 2 })
  expect(() => code128bValues('é')).toThrow(RangeError)
})
