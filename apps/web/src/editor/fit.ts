/**
 * Fit, as the Language board defines it (F21): the largest scale at which the whole label sits
 * inside the canvas minus a 24px inset, **snapped down** to a 0.1 step — so Fit can never clip
 * (atlas 31, 36–38). Snapping down is the whole trick: a rounded-to-nearest step overflows the
 * box by up to 5% and crops the label silently.
 *
 * Pure arithmetic on px, so it is the one piece of the canvas that can be unit-tested.
 */
/** The breathing room Fit keeps on every side — the canvas's own padding, in one place. */
export const INSET = 24
const STEP = 10 // 0.1
/** ×0.5–×8 is the zoom range the manual controls use; Fit stays inside it. */
const MIN = 0.1
const MAX = 8

type Box = { width: number; height: number }

export function fitScale(canvas: Box, label: Box): number {
  if (!(canvas.width > 0) || !(canvas.height > 0) || !(label.width > 0) || !(label.height > 0)) return 1
  const room = Math.min((canvas.width - 2 * INSET) / label.width, (canvas.height - 2 * INSET) / label.height)
  return Math.min(MAX, Math.max(MIN, Math.floor(room * STEP) / STEP))
}
