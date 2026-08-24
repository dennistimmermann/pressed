import type { FrameMessage, RenderRequest, RenderResult } from './types'

export class RenderSuperseded extends Error {
  constructor() { super('render superseded by a newer one') }
}

/** A missing runtime asset or a crashed frame must become an error, never an eternal spinner
    (COR-03). Ready covers the first load; every render carries its own deadline. */
const READY_TIMEOUT = 10_000
const RENDER_TIMEOUT = 30_000

/** The frame runs untrusted template code: its messages are validated, not trusted (TEST-02). */
function isFrameMessage(data: unknown): data is FrameMessage {
  if (typeof data !== 'object' || data === null) return false
  const m = data as Record<string, unknown>
  if (m.type === 'ready') return true
  return m.type === 'result' && typeof m.id === 'number' &&
    typeof m.css === 'string' && Array.isArray(m.html) && Array.isArray(m.errors)
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
  let failReady: (e: Error) => void
  const ready = new Promise<void>((res, rej) => { markReady = res; failReady = rej })
  ready.catch(() => { /* handled where awaited; this keeps an unused client from an unhandled rejection */ })
  const readyTimer = setTimeout(() => failReady(new Error(`runtime frame did not answer within ${READY_TIMEOUT / 1000}s — reload to retry`)), READY_TIMEOUT)
  frame.onerror = () => failReady(new Error('runtime frame failed to load'))

  function onMessage(event: MessageEvent) {
    if (event.source !== frame.contentWindow) return // the frame is null-origin; identify it by window
    if (!isFrameMessage(event.data)) return // the frame runs untrusted code: malformed shapes are dropped
    const data = event.data
    if (data.type === 'ready') { clearTimeout(readyTimer); return markReady() }
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
      const promise = new Promise<RenderResult>((resolve, reject) => {
        const deadline = setTimeout(() => { pending.delete(id); reject(new Error(`render timed out after ${RENDER_TIMEOUT / 1000}s`)) }, RENDER_TIMEOUT)
        pending.set(id, {
          resolve: (r) => { clearTimeout(deadline); resolve(r) },
          reject: (e) => { clearTimeout(deadline); reject(e) },
        })
      })
      frame.contentWindow!.postMessage({ type: 'render', id, ...req } satisfies RenderRequest, '*')
      return promise
    },
    destroy() {
      clearTimeout(readyTimer)
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
