import { browserPrinter } from './browser'
import { tsplUsbPrinter } from './tspl-webusb'
import type { Printer } from './types'

/** Append a backend here to add one. */
export const PRINTERS: Printer[] = [browserPrinter, tsplUsbPrinter]

export const printerById = (id: string) => PRINTERS.find((p) => p.id === id) ?? PRINTERS[0]
export { K30F } from './types'
export type { Printer }
