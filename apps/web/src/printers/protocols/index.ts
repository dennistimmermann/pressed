import type { Component } from 'vue'
import type { PrinterSettings, PrintJob, TsplConfig } from '../types'
import { tsplProtocol } from './tspl'

/**
 * What the direct backend speaks. `id` doubles as the key of this protocol's config slice in
 * `settings.printer`, so a protocol's settings and its printer are never out of step.
 */
export type Protocol = {
  id: PrinterSettings['protocol']
  label: string
  /** The Protocol section's field rows — it reads and writes its own settings slice. */
  Settings: Component
  print(job: PrintJob, cfg: TsplConfig): Promise<void>
}

/** Append a protocol here to add one; its files sit next to this. */
export const PROTOCOLS: Protocol[] = [tsplProtocol]

export const protocolById = (id: string) => PROTOCOLS.find((p) => p.id === id) ?? PROTOCOLS[0]
