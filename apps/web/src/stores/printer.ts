import { computed, reactive, toRaw, watch } from 'vue'
import { rotatedSize } from '@pressed/core'
import { backendById } from '../printers'
import { protocolById } from '../printers/protocols'
import { planJob } from '../printers/plan'
import { renderPrintLabels } from '../printers/render'
import { connectDevice as pickDevice, device, refreshDevice } from '../printers/device'
import { editor, meta } from './editor'
import { mappedSelectedRows } from './data'
import { settings } from './settings'

// The store is the coordinator (ARC-03): planning is `printers/plan`, rendering is
// `printers/render`, the device is `printers/device` — here lives only user-facing status
// and the wiring between them.

export { device, refreshDevice }

export const printer = reactive({
  busy: false,
  /** Inline, never a toast (invariant 5): shown in the Printer view. */
  error: null as string | null,
  lastPrint: null as string | null,
})

/** The top bar's Printer badge: the browser dialog is always there, a device has to be picked. */
export const printerBadge = computed(() =>
  settings.printer.backend === 'browser'
    ? 'Browser Print'
    : `Direct · ${protocolById(settings.printer.protocol).label} · ${device.claimed ? device.label : 'not connected'}`,
)

/**
 * Choosing a backend chooses how it prints: the dialog gets sheets of labels, a label printer
 * gets a roll. Only on a *change* — a user who then picks the other output keeps it.
 */
watch(() => settings.printer.backend, (b) => { settings.print.output = b === 'browser' ? 'sheet' : 'roll' })

/**
 * The label's footprint on the medium: the template's size, turned. Rotation enters the app's
 * geometry here and nowhere else — every fit, preview and cost line reads this, never `meta.size`.
 */
export const printSize = computed(() => rotatedSize(meta.value.size, settings.print.rotation))

/** How many labels the job is, and what that costs in sheets or roll — the Job section. */
export const plan = computed(() => planJob(mappedSelectedRows.value.map(toRaw), printSize.value, settings.print))

/** The chooser, with its failure put where errors belong: the Printer view's status line. */
export async function connectDevice() {
  printer.error = null
  try {
    await pickDevice()
  } catch (e) {
    printer.error = describe(e)
  }
}

/** Print every selected row; the backend turns the rendered labels into pages or dots. */
export async function printSelected() {
  const rows = mappedSelectedRows.value
  if (!rows.length || printer.busy || plan.value.oversized) return
  printer.busy = true
  printer.error = null
  printer.lastPrint = null
  try {
    // `toRaw`: a Vue proxy cannot be structured-cloned through postMessage.
    const labels = await renderPrintLabels(editor.source, toRaw(editor.assets), rows.map(toRaw), settings.print.copies)
    const { output, sheet, roll, rotation } = settings.print
    const backend = backendById(settings.printer.backend)
    await backend.print({ labels, size: meta.value.size, margin: meta.value.margin ?? 0, output, sheet, roll, rotation }, settings.printer)
    const sheets = plan.value.sheet.sheets(labels.length)
    const cost = output === 'sheet'
      ? `${sheets} sheet${sheets === 1 ? '' : 's'}`
      : `${plan.value.roll.sets(labels.length)} sets`
    printer.lastPrint = `sent ${labels.length} label${labels.length === 1 ? '' : 's'} · ${cost} to ${backend.label}`
  } catch (e) {
    printer.error = describe(e)
  } finally {
    printer.busy = false
  }
}

const describe = (e: unknown) => (e instanceof Error ? e.message : String(e))
