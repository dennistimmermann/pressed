import { sheetFit } from '@sprint/core'
import type { Output } from './index'
import SheetPreview from './SheetPreview.vue'
import SheetSettings from './SheetSettings.vue'

/** Labels imposed on cut sheets — the browser print dialog's shape. */
export const sheetOutput: Output = {
  id: 'sheet',
  label: 'Sheet',
  Settings: SheetSettings,
  Preview: SheetPreview,
  plan(print, size, labels) {
    const { perSheet, sheets } = sheetFit(print.sheet, size)
    const n = sheets(labels)
    return [`${perSheet} per sheet →`, ` ${n} sheet${n === 1 ? '' : 's'}`]
  },
}
