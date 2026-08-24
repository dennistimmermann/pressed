import { protocolById } from './protocols'
import type { Printer } from './types'

/** Straight at the device: the chosen protocol encodes the job, its own config in hand. */
export const directPrinter: Printer = {
  id: 'direct',
  label: 'Direct',
  print(job, ctx) {
    const protocol = protocolById(ctx.protocol)
    return protocol.print(job, ctx[protocol.id])
  },
}
