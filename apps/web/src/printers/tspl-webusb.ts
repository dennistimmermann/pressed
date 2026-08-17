import { encodeTspl, toBits } from '@sprint/core/raster/dither.ts'
import { parseStatus, STATUS_REQUEST } from '@sprint/core/tspl/tspl.ts'
import { rasterize, stripDataLoc } from '@/raster'
import { openUsbPrinter } from './webusb'
import { K30F, type Printer } from './types'

/**
 * TSPL over WebUSB — what the K30F actually speaks. The printer must be switched on *before*
 * it is plugged in, otherwise it enumerates half-dead (VID/PID 0) and claimInterface fails.
 */
export const tsplUsbPrinter: Printer = {
  id: 'tspl-usb',
  label: 'TSPL over WebUSB (K30F)',
  async print(labels, size) {
    const usb = await openUsbPrinter()
    try {
      // <ESC>!? status poll — best effort: the K30F does not answer, so silence means ready.
      await usb.write(STATUS_REQUEST)
      const status = await usb.read(1)
      if (status?.length) {
        const { ok, flags } = parseStatus(status[0])
        if (!ok && !flags.includes('printing'))
          throw new Error(`Printer not ready: ${flags.join(', ') || `status 0x${status[0].toString(16)}`}`)
      }
      for (const label of labels) {
        const image = await rasterize({ html: stripDataLoc(label.html), css: label.css }, size, K30F)
        // TSPL BITMAP: bit 1 = white, so pack with oneIsBlack = false.
        const bits = toBits(image, false)
        await usb.write(encodeTspl(bits, image.width, image.height, { ...K30F, widthMm: size.width, heightMm: size.height }))
      }
    } finally {
      await usb.close()
    }
  },
}
