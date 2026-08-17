import { expect, test } from 'vitest'
import { TsplJob, parseStatus, rasterLabel } from './tspl'

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join(' ')

test('reproduces the BITMAP example from the TSPL manual byte-for-byte', () => {
  // TSC TSPL/TSPL2 Programming Manual, BITMAP section, "Sample Code (ASCII) / Hexadecimal".
  const data = new Uint8Array([
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x07, 0xff, 0x03, 0xff, 0x11, 0xff, 0x18, 0xff, 0x1c, 0x7f,
    0x1e, 0x3f, 0x1f, 0x1f, 0x1f, 0x8f, 0x1f, 0xc7, 0x1f, 0xe3, 0x1f, 0xe7, 0x1f, 0xff, 0x1f, 0xff,
  ])
  const job = new TsplJob().raw('SIZE 4,2').raw('GAP 0,0').cls().bitmap(200, 200, 2, 16, data).print(1, 1)
  const expected =
    '53 49 5a 45 20 34 2c 32 0d 0a ' + // SIZE 4,2
    '47 41 50 20 30 2c 30 0d 0a ' + // GAP 0,0
    '43 4c 53 0d 0a ' + // CLS
    '42 49 54 4d 41 50 20 32 30 30 2c 32 30 30 2c 32 2c 31 36 2c 30 2c ' + // BITMAP 200,200,2,16,0,
    hex(data) + ' 0d 0a ' +
    '50 52 49 4e 54 20 31 2c 31 0d 0a' // PRINT 1,1
  expect(hex(job.bytes())).toBe(expected)
})

test('metric commands and validation follow the manual', () => {
  const t = new TextDecoder().decode(
    new TsplJob().size(60, 40).gap(2).density(8).speed(4).direction(1).reference(0, 0).cls().print().bytes(),
  )
  expect(t).toBe('SIZE 60 mm,40 mm\r\nGAP 2 mm,0 mm\r\nDENSITY 8\r\nSPEED 4\r\nDIRECTION 1,0\r\nREFERENCE 0,0\r\nCLS\r\nPRINT 1,1\r\n')
  expect(() => new TsplJob().density(16)).toThrow(RangeError)
  expect(() => new TsplJob().gap(128)).toThrow(RangeError)
  expect(() => new TsplJob().bitmap(0, 0, 2, 2, new Uint8Array(3))).toThrow(/expected 2\*2/)
  expect(() => new TsplJob().print(0)).toThrow(RangeError)
})

test('rasterLabel omits SPEED when not given', () => {
  const t = new TextDecoder().decode(rasterLabel({ widthMm: 30, heightMm: 20, gapMm: 0, widthBytes: 1, heightDots: 1, bits: new Uint8Array([0xff]) }))
  expect(t).not.toContain('SPEED')
  expect(t).toContain('GAP 0 mm,0 mm')
})

test('parseStatus', () => {
  expect(parseStatus(0)).toEqual({ ok: true, flags: [] })
  expect(parseStatus(0x05).flags).toEqual(['head opened', 'out of paper'])
})
