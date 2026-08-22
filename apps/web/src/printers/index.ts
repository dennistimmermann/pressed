import { browserPrinter } from './browser'
import { directPrinter } from './direct'
import type { Printer } from './types'

/** Append a backend here to add one. */
export const BACKENDS: Printer[] = [browserPrinter, directPrinter]

export const backendById = (id: string) => BACKENDS.find((p) => p.id === id) ?? BACKENDS[0]
export type { Printer, PrintJob } from './types'
