import type { FrameMessage, RenderRequest, RenderResult } from './types'

export class RenderSuperseded extends Error {
  constructor() { super('render superseded by a newer one') }
}

/**
 * Client for the runtime frame: a `sandbox="allow-scripts"` iframe, so template code runs on
 * a null origin with no access to this app (spec §4.3). Requests are matched by id, so any
 * number can be in flight — the preview, print thumbnails and the Label placeholder all share
 * this one frame. Latest-wins is each caller's concern (debounce + a token where it matters);
 * `RenderSuperseded` remains only for `destroy()`.
 */
export function createRuntimeClient(runtimeUrl: string, parent: HTMLElement = document.body) {
  const frame = document.createElement('iframe')
  frame.sandbox.add('allow-scripts')
  frame.src = runtimeUrl
  frame.style.display = 'none'
  frame.setAttribute('aria-hidden', 'true')

  let nextId = 1
  const pending = new Map<number, { resolve: (r: RenderResult) => void; reject: (e: Error) => void }>()
  let markReady: () => void
  const ready = new Promise<void>((r) => { markReady = r })

  function onMessage(event: MessageEvent) {
    if (event.source !== frame.contentWindow) return // the frame is null-origin; identify it by window
    const data = event.data as FrameMessage
    if (data?.type === 'ready') return markReady()
    if (data?.type !== 'result') return
    pending.get(data.id)?.resolve(data)
    pending.delete(data.id)
  }

  addEventListener('message', onMessage)
  parent.append(frame)

  return {
    frame,
    ready,
    async render(req: Omit<RenderRequest, 'type' | 'id'>): Promise<RenderResult> {
      await ready
      const id = nextId++
      const promise = new Promise<RenderResult>((resolve, reject) => { pending.set(id, { resolve, reject }) })
      frame.contentWindow!.postMessage({ type: 'render', id, ...req } satisfies RenderRequest, '*')
      return promise
    },
    destroy() {
      removeEventListener('message', onMessage)
      for (const p of pending.values()) p.reject(new RenderSuperseded())
      pending.clear()
      frame.remove()
    },
  }
}

export type RuntimeClient = ReturnType<typeof createRuntimeClient>

/**
 * Trailing-edge debounce — typing runs compile + render on a 150ms debounce (design §4).
 * Here rather than in the host because every consumer of `render` wants exactly this, and
 * a superseded in-flight render already resolves itself (`RenderSuperseded`).
 */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  return (...args: A) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}
