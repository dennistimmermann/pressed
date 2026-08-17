import type { Meta, PrinterProfile, RenderedLabel } from '@sprint/core'

/** A printer backend: given rendered labels and the label size in mm, put them on paper. */
export type Printer = {
  id: string
  label: string
  print(labels: RenderedLabel[], size: Meta['size']): Promise<void>
}

/** ChiTenk K30F: 80 mm head, 203 dpi, 72 mm printable. Verified on hardware. */
export const K30F: PrinterProfile = { dpi: 203, maxDots: 576, gapMm: 2, density: 8 }
