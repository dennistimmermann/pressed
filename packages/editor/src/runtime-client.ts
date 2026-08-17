import type { FrameMessage, RenderRequest, RenderResult } from './types'

export class RenderSuperseded extends Error {
  constructor() { super('render superseded by a newer one') }
}

/**
 * Client for the runtime frame: a `sandbox="allow-scripts"` iframe, so template code runs on
 * a null origin with no access to this app (spec §4.3). Latest-wins — while the user types,
 * only the newest render matters, so an in-flight one is rejected with `RenderSuperseded`.
 */
export function createRuntimeClient(runtimeUrl: string, parent: HTMLElement = document.body) {
  const frame = document.createElement('iframe')
  frame.sandbox.add('allow-scripts')
  frame.src = runtimeUrl
  frame.style.display = 'none'
  frame.setAttribute('aria-hidden', 'true')

  let nextId = 1
  let pending: { id: number; resolve: (r: RenderResult) => void; reject: (e: Error) => void } | null = null
  let markReady: () => void
  const ready = new Promise<void>((r) => { markReady = r })

  function onMessage(event: MessageEvent) {
    if (event.source !== frame.contentWindow) return // the frame is null-origin; identify it by window
    const data = event.data as FrameMessage
    if (data?.type === 'ready') return markReady()
    if (data?.type !== 'result' || !pending || data.id !== pending.id) return
    pending.resolve(data)
    pending = null
  }

  addEventListener('message', onMessage)
  parent.append(frame)

  return {
    frame,
    ready,
    async render(req: Omit<RenderRequest, 'type' | 'id'>): Promise<RenderResult> {
      await ready
      pending?.reject(new RenderSuperseded())
      const id = nextId++
      const promise = new Promise<RenderResult>((resolve, reject) => { pending = { id, resolve, reject } })
      frame.contentWindow!.postMessage({ type: 'render', id, ...req } satisfies RenderRequest, '*')
      return promise
    },
    destroy() {
      removeEventListener('message', onMessage)
      pending?.reject(new RenderSuperseded())
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
