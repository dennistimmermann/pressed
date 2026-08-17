import { computed, reactive, toRaw } from 'vue'
import { runtime } from '../runtime-client'
import { printerById } from '../printers'
import { editor, meta } from './editor'
import { selectedRows } from './data'
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

/** One truth for the chosen backend: it is a setting, the store just exposes it. */
export const printerId = computed({
  get: () => settings.printerId,
  set: (id: string) => { settings.printerId = id },
})

/** The top bar's Printer badge: the browser dialog is always there, USB needs a device. */
export const printerBadge = computed(() =>
  settings.printerId === 'browser'
    ? '● browser'
    : `${printer.deviceStatus.claimed ? '●' : '○'} ${printer.deviceStatus.label}`,
)

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
  const rows = selectedRows.value
  if (!rows.length || printer.busy) return
  printer.busy = true
  printer.error = null
  printer.lastPrint = null
  try {
    // `toRaw`: a Vue proxy cannot be structured-cloned through postMessage.
    const result = await runtime().render({ source: editor.source, assets: toRaw(editor.assets), rows: rows.map(toRaw), inspector: false })
    const fatal = result.errors.filter((e) => e.kind !== 'purity')
    if (fatal.length) throw new Error(`${fatal[0].file}: ${fatal[0].message}`)
    const labels = result.html.map((html) => ({ html, css: result.css }))
    await printerById(settings.printerId).print(labels, meta.value.size)
    printer.lastPrint = `sent ${labels.length} label${labels.length === 1 ? '' : 's'} to ${printerById(settings.printerId).label}`
  } catch (e) {
    printer.error = describe(e)
  } finally {
    printer.busy = false
  }
}

const describe = (e: unknown) => (e instanceof Error ? e.message : String(e))
