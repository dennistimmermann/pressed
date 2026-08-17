/** Minimal WebUSB transport for a USB printer-class device: pick → claim → bulk OUT. */
export async function openUsbPrinter() {
  // An already-permitted device prints without a chooser; only the first time asks.
  const dev = (await navigator.usb.getDevices())[0] ?? (await navigator.usb.requestDevice({ filters: [{ classCode: 7 }] }))
  await dev.open()
  try {
    if (dev.configuration == null) await dev.selectConfiguration(1)
    const iface = dev.configuration!.interfaces.find((i) =>
      i.alternate.endpoints.some((e) => e.direction === 'out' && e.type === 'bulk'),
    )
    if (!iface) throw new Error('No bulk OUT endpoint on this device')
    await dev.claimInterface(iface.interfaceNumber)
    const ep = iface.alternate.endpoints.find((e) => e.direction === 'out' && e.type === 'bulk')!
    const epIn = iface.alternate.endpoints.find((e) => e.direction === 'in' && e.type === 'bulk')
    return {
      device: dev,
      /** Read up to `len` bytes from the bulk IN endpoint, or null if none / no answer within `timeoutMs`. */
      async read(len = 64, timeoutMs = 500): Promise<Uint8Array | null> {
        if (!epIn) return null
        const t = new Promise<null>((r) => setTimeout(() => r(null), timeoutMs))
        const r = await Promise.race([dev.transferIn(epIn.endpointNumber, len), t])
        return r?.data ? new Uint8Array(r.data.buffer) : null
      },
      async write(bytes: Uint8Array<ArrayBuffer>, chunk = 4096) {
        for (let i = 0; i < bytes.length; i += chunk) {
          const r = await dev.transferOut(ep.endpointNumber, bytes.subarray(i, i + chunk))
          if (r.status !== 'ok') throw new Error(`USB transfer ${r.status}`)
        }
      },
      close: () => dev.close(),
    }
  } catch (e) {
    await dev.close() // never leave the device open — it blocks the next attempt (and CUPS)
    throw e
  }
}
