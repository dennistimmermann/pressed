import type { Component } from 'vue'
import type { PrintSettings } from '@/stores/settings'
import { rollOutput } from './roll'
import { sheetOutput } from './sheet'

type Size = { width: number; height: number }

export type Output = {
  id: PrintSettings['output']
  label: string
  /** The Output section's field rows — it reads and writes its own `settings.print` slice. */
  Settings: Component
  /** The trough: what the job lands on. Props: `slots`, `page`, `pages`, `empty`. */
  Preview: Component
  /** The Job section's cost line, split at the arrow — the tail carries the number. */
  plan: (print: PrintSettings, size: Size, labels: number) => [string, string]
}

/** Append an output here to add one; its files sit next to this. */
export const OUTPUTS: Output[] = [sheetOutput, rollOutput]
