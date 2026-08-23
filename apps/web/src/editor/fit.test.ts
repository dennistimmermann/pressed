import { describe, expect, it } from 'vitest'
import { fitScale } from './fit'

/** The one promise Fit makes: at the scale it returns, the label is inside the canvas. */
const fits = (canvas: { width: number; height: number }, label: { width: number; height: number }) => {
  const k = fitScale(canvas, label)
  return label.width * k <= canvas.width && label.height * k <= canvas.height
}

describe('fitScale', () => {
  it('never clips — at any canvas, for any label', () => {
    for (const w of [120, 300, 657, 1200]) {
      for (const h of [90, 240, 428, 900]) {
        for (const label of [{ width: 189, height: 113 }, { width: 151, height: 57 }, { width: 76, height: 38 }, { width: 1200, height: 40 }]) {
          expect(fits({ width: w, height: h }, label)).toBe(true)
        }
      }
    }
  })

  it('snaps down to a 0.1 step', () => {
    // 657 − 48 = 609 wide for a 189px label = ×3.22 → ×3.2, never ×3.3.
    expect(fitScale({ width: 657, height: 1000 }, { width: 189, height: 113 })).toBe(3.2)
  })

  it('keeps the 24px inset on the tight axis', () => {
    // Exactly 100 + 2×24 of room: ×1.0, not more.
    expect(fitScale({ width: 148, height: 148 }, { width: 100, height: 100 })).toBe(1)
  })

  it('stays inside the zoom range and survives a canvas with no room', () => {
    expect(fitScale({ width: 10, height: 10 }, { width: 189, height: 113 })).toBe(0.1)
    expect(fitScale({ width: 4000, height: 4000 }, { width: 10, height: 10 })).toBe(8)
    expect(fitScale({ width: 0, height: 0 }, { width: 189, height: 113 })).toBe(1)
  })
})
