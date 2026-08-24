import { reactive } from 'vue'

export type DeviceStatus = { claimed: boolean; label: string }

/** The one WebUSB device the direct backend prints to — status only; opening it per job is
    the protocol's business (`webusb.ts`). */
export const device = reactive<DeviceStatus>({ claimed: false, label: 'no device' })

/** Devices the user already granted us; no prompt, so it is safe to call on mount. */
export async function refreshDevice() {
  if (!navigator.usb) return Object.assign(device, { claimed: false, label: 'no WebUSB' })
  const [found] = await navigator.usb.getDevices()
  Object.assign(device, found
    ? { claimed: true, label: found.productName || 'USB printer' }
    : { claimed: false, label: 'no device' })
}

/** The chooser — a user gesture is required, so this can only come from a click. Throws so the
    caller (the printer store) can put the message where errors belong: inline. */
export async function connectDevice() {
  await navigator.usb.requestDevice({ filters: [{ classCode: 7 }] })
  await refreshDevice()
}
