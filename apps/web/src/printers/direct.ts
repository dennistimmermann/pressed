import { settings } from '@/stores/settings'
import { protocolById } from './protocols'
import type { Printer } from './types'

/** Straight at the device: the chosen protocol encodes the job, its own config in hand. */
export const directPrinter: Printer = {
  id: 'direct',
  label: 'Direct',
  print(job) {
    const protocol = protocolById(settings.printer.protocol)
    return protocol.print(job, settings.printer[protocol.id])
  },
}
