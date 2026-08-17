/**
 * Code 128 subset B — the only symbology the label library needs, so ~40 lines instead of a
 * dependency. Each of the 107 symbols is six alternating bar/space widths (bar first) summing
 * to 11 modules; the stop symbol has seven and sums to 13. Table per ISO/IEC 15417.
 */
export const CODE128_TABLE = (
  '212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 ' +
  '221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 ' +
  '221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 ' +
  '212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 ' +
  '231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 ' +
  '231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 ' +
  '314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 ' +
  '112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 ' +
  '111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 ' +
  '214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 ' +
  '114131 311141 411131 211412 211214 211232 2331112'
).split(' ')

const START_B = 104
const STOP = 106

/** Encode `text` (printable ASCII 32..126) as Code 128 B symbol values, checksum and stop included. */
export function code128bValues(text: string): number[] {
  const values = [START_B]
  for (const ch of text) {
    const v = ch.charCodeAt(0) - 32
    if (v < 0 || v > 94) throw new RangeError(`Code128B cannot encode ${JSON.stringify(ch)}`)
    values.push(v)
  }
  // Weighted mod-103 check: start symbol counts once, then position 1, 2, 3, …
  const sum = values.reduce((acc, v, i) => acc + v * (i === 0 ? 1 : i), 0)
  values.push(sum % 103, STOP)
  return values
}

/** Encode `text` as bar runs (`x` and `width` in modules) plus the total width in modules. */
export function code128bBars(text: string): { bars: { x: number; width: number }[]; modules: number } {
  const bars: { x: number; width: number }[] = []
  let x = 0
  for (const value of code128bValues(text))
    for (const [i, digit] of [...CODE128_TABLE[value]].entries()) {
      const w = +digit
      if (i % 2 === 0) bars.push({ x, width: w }) // even index = bar, odd = space
      x += w
    }
  return { bars, modules: x }
}
