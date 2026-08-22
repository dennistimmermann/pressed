import { computed, reactive, toRaw, watch } from 'vue'
import { isWarning } from '@sprint/core'
import { runtime } from '@/render/runtime-client'
import { backendById } from '../printers'
import { protocolById } from '../printers/protocols'
import { expandCopies, rollFit, rotatedSize, sheetFit } from '@sprint/core'
import { editor, meta } from './editor'
import { mappedSelectedRows } from './data'
import { settings } from './settings'

export type DeviceStatus = { claimed: boolean; label: string }

export const printer = reactive({
  /** Free-text status shown next to the Printer tab's dot (design §2). */
  deviceStatus: { claimed: false, label: 'no device' } as DeviceStatus,
  busy: false,
  /** Inline, never a toast (invariant 5): shown in the Printer view. */
  error: null as string | null,
  lastPrint: null as string | null,
})

/** The top bar's Printer badge: the browser dialog is always there, a device has to be picked. */
export const printerBadge = computed(() =>
  settings.printer.backend === 'browser'
    ? 'Browser Print'
    : `Direct · ${protocolById(settings.printer.protocol).label} · ${printer.deviceStatus.claimed ? printer.deviceStatus.label : 'not connected'}`,
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
export const plan = computed(() => {
  const entries = mappedSelectedRows.value
  const labels = expandCopies(entries.map(toRaw), settings.print.copies).length
  const sheet = sheetFit(settings.print.sheet, printSize.value)
  const roll = rollFit(settings.print.roll, printSize.value)
  return { entries: entries.length, labels, sheet, roll }
})

/** Devices the user already granted us; no prompt, so it is safe to call on mount. */
export async function refreshDevice() {
  if (!navigator.usb) return (printer.deviceStatus = { claimed: false, label: 'no WebUSB' })
  const [device] = await navigator.usb.getDevices()
  printer.deviceStatus = device
    ? { claimed: true, label: device.productName || 'USB printer' }
    : { claimed: false, label: 'no device' }
}

/** The chooser — a user gesture is required, so this can only come from a click. */
export async function connectDevice() {
  printer.error = null
  try {
    await navigator.usb.requestDevice({ filters: [{ classCode: 7 }] })
    await refreshDevice()
  } catch (e) {
    printer.error = describe(e)
  }
}

/**
 * Print every selected row: one render of all rows through the runtime frame (no `data-loc`,
 * it must never reach paper), then the backend turns them into pages or dots.
 */
export async function printSelected() {
  const rows = mappedSelectedRows.value
  if (!rows.length || printer.busy) return
  printer.busy = true
  printer.error = null
  printer.lastPrint = null
  try {
    // `toRaw`: a Vue proxy cannot be structured-cloned through postMessage.
    const result = await runtime().render({ source: editor.source, assets: toRaw(editor.assets), rows: rows.map(toRaw), inspector: false })
    const fatal = result.errors.filter((e) => !isWarning(e))
    if (fatal.length) throw new Error(`${fatal[0].file}: ${fatal[0].message}`)
    // Pair each row with its render *before* expanding, so a column-bound copy count is read
    // off the row it belongs to.
    const paired = rows.map((row, i) => ({ ...toRaw(row), _label: { html: result.html[i], css: result.css } }))
    const labels = expandCopies(paired, settings.print.copies).map((p) => p._label)

    const { output, sheet, roll, rotation } = settings.print
    const backend = backendById(settings.printer.backend)
    await backend.print({ labels, size: meta.value.size, margin: meta.value.margin ?? 0, output, sheet, roll, rotation })
    const sheets = sheetFit(sheet, printSize.value).sheets(labels.length)
    const cost = output === 'sheet'
      ? `${sheets} sheet${sheets === 1 ? '' : 's'}`
      : `${rollFit(roll, printSize.value).sets(labels.length)} sets`
    printer.lastPrint = `sent ${labels.length} label${labels.length === 1 ? '' : 's'} · ${cost} to ${backend.label}`
  } catch (e) {
    printer.error = describe(e)
  } finally {
    printer.busy = false
  }
}

const describe = (e: unknown) => (e instanceof Error ? e.message : String(e))
