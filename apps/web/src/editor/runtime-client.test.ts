import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createRuntimeClient } from './runtime-client'

// Node has no DOM; the client only needs createElement and a parent with append. Messages are
// plain Events with data/source assigned — the handler reads exactly those two fields.
const fakeFrame = () => ({
  sandbox: { add: () => {} },
  style: {},
  setAttribute: () => {},
  src: '',
  remove: () => {},
  contentWindow: { postMessage: () => {} },
  onerror: null,
})
const parent = { append: () => {} } as unknown as HTMLElement
const message = (data: unknown, source: unknown) => Object.assign(new Event('message'), { data, source })

// Node's globalThis has no window event surface — back the client's bare addEventListener/
// dispatchEvent with one EventTarget.
const bus = new EventTarget()
const dispatchEvent = (e: Event) => bus.dispatchEvent(e)

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('document', { createElement: fakeFrame })
  vi.stubGlobal('addEventListener', bus.addEventListener.bind(bus))
  vi.stubGlobal('removeEventListener', bus.removeEventListener.bind(bus))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

test('ready rejects after the timeout instead of hanging forever (COR-03)', async () => {
  const client = createRuntimeClient('runtime.html', parent)
  const outcome = client.ready.then(() => 'ready', (e: Error) => e.message)
  vi.advanceTimersByTime(10_001)
  await expect(outcome).resolves.toMatch(/did not answer/)
  client.destroy()
})

test('a render request rejects after its deadline (COR-03)', async () => {
  const client = createRuntimeClient('runtime.html', parent)
  dispatchEvent(message({ type: 'ready' }, client.frame.contentWindow))
  const outcome = client.render({ source: '' }).then(() => 'ok', (e: Error) => e.message)
  await vi.advanceTimersByTimeAsync(30_001)
  await expect(outcome).resolves.toMatch(/timed out/)
  client.destroy()
})

test('malformed frame messages are dropped, well-formed ones resolve (TEST-02)', async () => {
  const client = createRuntimeClient('runtime.html', parent)
  const source = client.frame.contentWindow
  dispatchEvent(message({ type: 'ready' }, source))
  const outcome = client.render({ source: '' })
  await vi.advanceTimersByTimeAsync(0) // let render pass `await ready` and register id 1
  dispatchEvent(message('garbage', source))
  dispatchEvent(message({ type: 'result', id: '1', css: 5 }, source)) // wrong types: dropped
  dispatchEvent(message({ type: 'result', id: 1, meta: {}, css: '', html: ['<b/>'], errors: [], components: [] }, source))
  await expect(outcome).resolves.toMatchObject({ id: 1, html: ['<b/>'] })
  client.destroy()
})
