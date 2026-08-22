/**
 * Fixed-space coordinates for a menu anchored to a button's rect. Panes scroll and clip, and
 * no `z-index` frees an absolutely-positioned child from an ancestor's overflow — so menus
 * render `position: fixed` and are placed here: below the anchor when there is room, flipped
 * above it otherwise, clamped into the viewport horizontally.
 */
export function anchorMenu(
  r: DOMRect,
  width: number,
  opts: { align?: 'left' | 'right'; height?: number } = {},
): { left: string; top?: string; bottom?: string } {
  const x = opts.align === 'right' ? r.right - width : r.left
  const left = `${Math.max(8, Math.min(x, window.innerWidth - width - 8))}px`
  const below = window.innerHeight - r.bottom
  // ponytail: `height` is an estimate (menus size to content); the flip only needs the side call.
  if (below >= (opts.height ?? 320) + 12 || below >= r.top) return { top: `${r.bottom + 6}px`, left }
  return { bottom: `${window.innerHeight - r.top + 6}px`, left }
}
