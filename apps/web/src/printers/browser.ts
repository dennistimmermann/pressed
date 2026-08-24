import { labelDocument, sheetDocument } from '@pressed/core/template/label.ts'
import type { Printer } from './types'

/** Chrome print dialog: a grid on cut sheets, or one label per page when the roll is chosen. */
export const browserPrinter: Printer = {
  id: 'browser',
  label: 'Browser Print',
  async print(job) {
    const label = { html: job.labels.map((l) => l.html), css: job.labels[0]?.css ?? '' }
    const frame = document.createElement('iframe')
    // Same-origin (so print() is callable) but no allow-scripts: template markup that survived
    // SSR cannot run script or inline handlers here. The document carries its own CSP too.
    frame.sandbox.add('allow-same-origin')
    frame.style.position = 'fixed'
    frame.style.right = '100%' // off-screen but rendered
    frame.srcdoc = job.output === 'sheet'
      ? sheetDocument(label, job.size, job.sheet, job.margin, job.rotation)
      : labelDocument(label, job.size, true, job.margin, job.rotation)
    document.body.append(frame)
    await new Promise((r) => { frame.onload = r })
    // Chrome blocks in print() until the dialog closes: the handler must exist before the call,
    // and a cancelled dialog may never fire afterprint — the timer sweeps the frame up either way.
    frame.contentWindow!.onafterprint = () => frame.remove()
    setTimeout(() => frame.remove(), 60_000)
    frame.contentWindow!.print()
  },
}
