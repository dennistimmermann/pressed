import { encodeTspl, toBits } from '@sprint/core/raster/dither.ts'
import { setDocument } from '@sprint/core/template/label.ts'
import { parseStatus, STATUS_REQUEST } from '@sprint/core/tspl/tspl.ts'
import { rasterize, stripDataLoc } from '@/render/raster'
import type { TsplConfig } from '@/stores/settings'
import { openUsbPrinter } from '../webusb'
import type { PrintJob } from '../types'
import TsplSettings from './TsplSettings.vue'

/** The config as the raster path wants it: `gapMm` is the job's, not the protocol's. */
const profile = (cfg: TsplConfig, gapMm: number) => ({
  dpi: cfg.dpi,
  maxDots: cfg.maxDots,
  density: cfg.density,
  gapMm,
  speed: cfg.speed ?? undefined, // null = say nothing, keep the printer's own SPEED
})

/**
 * TSPL over WebUSB. The printer must be switched on *before* it is plugged in, otherwise it
 * enumerates half-dead (VID/PID 0) and claimInterface fails.
 */
export const tsplProtocol = {
  id: 'tspl' as const,
  label: 'TSPL',
  Settings: TsplSettings,
  async print(job: PrintJob, cfg: TsplConfig) {
    const usb = await openUsbPrinter()
    try {
      // <ESC>!? status poll — best effort: some printers do not answer, so silence means ready.
      await usb.write(STATUS_REQUEST)
      const status = await usb.read(1)
      if (status?.length) {
        const { ok, flags } = parseStatus(status[0])
        if (!ok && !flags.includes('printing'))
          throw new Error(`Printer not ready: ${flags.join(', ') || `status 0x${status[0].toString(16)}`}`)
      }
      // The printer burns one set at a time: `across × down` labels are a single bitmap, and
      // job.roll.gap is the die-cut advance between sets (TSPL GAP), not part of the set.
      const perSet = Math.max(1, job.roll.across * job.roll.down)
      for (let start = 0; start < job.labels.length; start += perSet) {
        const set = setDocument(
          {
            html: job.labels.slice(start, start + perSet).map((l) => stripDataLoc(l.html)),
            css: job.labels[0].css,
          },
          job.size,
          job.roll,
          job.margin,
          job.rotation,
        )
        const image = await rasterize(set, set.size, profile(cfg, job.roll.gap))
        // TSPL BITMAP: bit 1 = white, so pack with oneIsBlack = false.
        const bits = toBits(image, false)
        await usb.write(encodeTspl(bits, image.width, image.height, {
          ...profile(cfg, job.roll.gap),
          widthMm: set.size.width,
          heightMm: set.size.height,
        }))
      }
    } finally {
      await usb.close()
    }
  },
}
