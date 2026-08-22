import { labelDocument, sheetDocument } from '@sprint/core/template/label.ts'
import type { Printer } from './types'

/** Chrome print dialog: a grid on cut sheets, or one label per page when the roll is chosen. */
export const browserPrinter: Printer = {
  id: 'browser',
  label: 'Browser Print',
  async print(job) {
    const label = { html: job.labels.map((l) => l.html), css: job.labels[0]?.css ?? '' }
    const frame = document.createElement('iframe')
    frame.style.position = 'fixed'
    frame.style.right = '100%' // off-screen but rendered
    frame.srcdoc = job.output === 'sheet'
      ? sheetDocument(label, job.size, job.sheet, job.margin, job.rotation)
      : labelDocument(label, job.size, true, job.margin, job.rotation)
    document.body.append(frame)
    await new Promise((r) => { frame.onload = r })
    frame.contentWindow!.print()
    frame.contentWindow!.onafterprint = () => frame.remove()
  },
}
