import { rasterLabel } from '../tspl/tspl'
import type { PrinterProfile } from '../types'

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

/** ImageData without the DOM — core must stay usable in Node (spoolserver, tests). */
export type ImageDataLike = { width: number; height: number; data: Uint8ClampedArray | Uint8Array }

/**
 * RGBA pixels → packed 1-bit rows, MSB first, ordered (Bayer 4×4) dither so greys survive
 * on a 1-bit thermal head. `oneIsBlack` picks the polarity: ESC/POS wants 1 = black,
 * TSPL BITMAP wants 1 = white.
 */
export function toBits(image: ImageDataLike, oneIsBlack: boolean): Uint8Array {
  const { width: w, height: h, data } = image
  const bytesPerRow = Math.ceil(w / 8)
  const bits = new Uint8Array(bytesPerRow * h).fill(oneIsBlack ? 0 : 0xff)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const lum = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000
      const threshold = (BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) * 16
      const black = lum < threshold
      if (black === oneIsBlack) bits[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7)
      else bits[y * bytesPerRow + (x >> 3)] &= ~(0x80 >> (x & 7))
    }
  return bits
}

/** Packed bits (from `toBits(image, false)`) → a complete TSPL job for one label. */
export function encodeTspl(
  bits: Uint8Array,
  widthDots: number,
  heightDots: number,
  profile: PrinterProfile & { widthMm: number; heightMm: number },
): Uint8Array<ArrayBuffer> {
  return rasterLabel({
    widthMm: profile.widthMm,
    heightMm: profile.heightMm,
    gapMm: profile.gapMm,
    density: profile.density,
    speed: profile.speed,
    widthBytes: Math.ceil(widthDots / 8),
    heightDots,
    bits,
  })
}
