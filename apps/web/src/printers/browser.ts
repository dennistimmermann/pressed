import { labelDocument } from '@sprint/core/template/label.ts'
import type { Printer } from './types'

/** Chrome print dialog: one label per page, page size = label size. */
export const browserPrinter: Printer = {
  id: 'browser',
  label: 'Browser print dialog',
  async print(labels, size) {
    const frame = document.createElement('iframe')
    frame.style.position = 'fixed'
    frame.style.right = '100%' // off-screen but rendered
    frame.srcdoc = labelDocument({ html: labels.map((l) => l.html), css: labels[0]?.css ?? '' }, size, true)
    document.body.append(frame)
    await new Promise((r) => { frame.onload = r })
    frame.contentWindow!.print()
    frame.contentWindow!.onafterprint = () => frame.remove()
  },
}
