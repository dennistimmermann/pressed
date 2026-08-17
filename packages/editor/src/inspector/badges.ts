/**
 * The 20×20 badge glyph of a component (design §3.1). The library has fixed glyphs; everything
 * else at this point is a snippet (a snippet may not take a library name — the loader errors).
 */
const GLYPHS: Record<string, string> = {
  QrCode: 'QR',
  Barcode: '|||',
  Img: 'IMG',
  Icon: '◆',
  Fit: 'Fit',
}

export function badgeFor(name: string): string {
  return GLYPHS[name] ?? 'S'
}
