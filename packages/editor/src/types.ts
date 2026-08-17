import type { ComponentSchema, Message, Meta, Row } from '@sprint/core'

// Mirrors of the core types the runtime frame speaks, re-exported so editor consumers do
// not have to depend on @sprint/core directly.
export type { ComponentSchema, Message, Meta, Row }

export type Asset = { mime: string; base64: string }
export type Assets = Record<string, Asset>

/** Host → frame. `inspector` adds `data-loc` so preview clicks map back to source. */
export type RenderRequest = {
  type: 'render'
  id: number
  source: string
  assets?: Assets
  rows?: Row[]
  inspector?: boolean
}

/** Frame → host. One `html` entry per requested row. */
export type RenderResult = {
  type: 'result'
  id: number
  meta: Meta
  css: string
  html: string[]
  errors: Message[]
  components: ComponentSchema[]
}

export type FrameMessage = { type: 'ready' } | RenderResult
