import type { SnippetScope } from '../tabs'

/**
 * `<snippet>` blocks are custom blocks: Volar sees them as opaque text, so nothing inside is
 * type-checked and no snippet is a known component. The fix is a *virtual model* per snippet —
 * the same SFC text the runtime compiles (`@sprint/core`'s loader `snippetToSfc`) — kept at its
 * own URI so the language service treats it as a real file.
 *
 * Everything here is pure: deriving the text and mapping an offset back into the one file.
 */

/** Where a snippet's virtual SFC lives. Its own directory, so a snippet cannot shadow a library component. */
export const SNIPPET_DIR = 'file:///sprint/snippets/'
export const snippetUri = (name: string) => `${SNIPPET_DIR}${name}.vue`

/** Names that can be both a file name and a `GlobalComponents` key. Anything else is skipped. */
export const SNIPPET_NAME = /^[A-Za-z][\w-]*$/

export type SnippetSfc = {
  name: string
  /** The SFC source — what the language service type-checks. */
  text: string
  /** File offset of `text` offset 0. Only meaningful inside `body` (a shorthand prefix is synthetic). */
  base: number
  /** The span of the verbatim block body inside `text`. */
  body: { start: number; end: number }
  /** Fallback range for a diagnostic that lands in synthesized text. */
  nameLoc: { start: number; end: number }
}

const OPEN = /^<snippet([^>]*)>/

/**
 * The snippet's SFC source plus the shift back to file offsets. Mirrors the loader: a full
 * snippet passes through verbatim, a shorthand one gets a synthetic `<template>` wrapper and
 * `defineProps` for `props="a b"` — typed `string` here (spec §4.1), where the runtime, which
 * needs no types, uses the array form.
 */
export function snippetSfc(source: string, s: SnippetScope): SnippetSfc {
  const open = OPEN.exec(source.slice(s.start, s.end))
  const bodyStart = s.start + (open?.[0].length ?? 0)
  const body = source.slice(bodyStart, source.lastIndexOf('</', s.end))
  if (!s.shorthand)
    return { name: s.name, text: body, base: bodyStart, body: { start: 0, end: body.length }, nameLoc: s.nameLoc }

  const names = (/props\s*=\s*["']([^"']*)["']/.exec(open?.[1] ?? '')?.[1] ?? '').trim().split(/\s+/).filter(Boolean)
  const declare = names.length
    ? `<script setup lang="ts">defineProps<{ ${names.map((n) => `${n}: string`).join('; ')} }>()</script>\n`
    : ''
  const prefix = `${declare}<template>`
  return {
    name: s.name,
    text: `${prefix}${body}</template>`,
    base: bodyStart - prefix.length,
    body: { start: prefix.length, end: prefix.length + body.length },
    nameLoc: s.nameLoc,
  }
}

/** An offset in the snippet SFC → the offset in the file, or `null` when it lands in synthesized text. */
export function toFileOffset(s: SnippetSfc, offset: number): number | null {
  return offset >= s.body.start && offset <= s.body.end ? s.base + offset : null
}
