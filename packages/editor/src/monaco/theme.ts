import { editor } from 'monaco-editor-core'

/**
 * The Monaco theme from design §3.3 — "so the app has one code voice".
 *
 * Two jobs: the fixed token palette from the design table, and the app tokens (`--accent`,
 * `--primary`, `--border`) read off `<html>` at call time so the editor follows the theme
 * toggle. Monaco only understands hex, and the tokens are `oklch()`, so every colour goes
 * through a 1×1 canvas — the browser is the only correct oklch→sRGB converter available.
 */

let ctx: CanvasRenderingContext2D | undefined

function hex(color: string): string {
  ctx ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')
}

const token = (v: string) => hex(getComputedStyle(document.documentElement).getPropertyValue(v).trim())

/** Design §3.3's table, plus dark variants (the design only fixes the dark background). */
const palette = {
  light: {
    background: 'oklch(0.985 0.003 90)',
    tag: 'oklch(0.42 0.10 215)',
    attribute: 'oklch(0.50 0.03 250)',
    expression: 'oklch(0.50 0.14 40)',
    text: 'oklch(0.45 0.01 60)',
    lineNumber: 'oklch(0.78 0.01 60)',
    marker: 'oklch(0.60 0.17 25)',
  },
  dark: {
    background: 'oklch(0.205 0.008 60)',
    tag: 'oklch(0.76 0.09 215)',
    attribute: 'oklch(0.72 0.03 250)',
    expression: 'oklch(0.78 0.13 40)',
    text: 'oklch(0.80 0.01 60)',
    lineNumber: 'oklch(0.45 0.01 60)',
    marker: 'oklch(0.68 0.17 25)',
  },
}

export const THEME_NAME = 'sprint'

/** (Re)define the theme for the current `<html>` class. Call again when `.dark` flips. */
export function defineSprintTheme(): string {
  const dark = document.documentElement.classList.contains('dark')
  const c = dark ? palette.dark : palette.light

  editor.defineTheme(THEME_NAME, {
    base: dark ? 'vs-dark' : 'vs',
    inherit: false,
    rules: [
      { token: '', foreground: hex(c.text) },
      { token: 'text', foreground: hex(c.text) },
      { token: 'tag', foreground: hex(c.tag) },
      { token: 'delimiter', foreground: hex(c.attribute) },
      { token: 'attribute.name', foreground: hex(c.attribute) },
      { token: 'attribute.value', foreground: hex(c.text) },
      { token: 'expression', foreground: hex(c.expression) },
      { token: 'comment', foreground: hex(c.lineNumber) },
      // Volar's semantic tokens land on top of the Monarch layer; keep them in the same
      // two voices the design names — code-blue for types, accent for values.
      { token: 'variable', foreground: hex(c.expression) },
      { token: 'property', foreground: hex(c.expression) },
      { token: 'function', foreground: hex(c.tag) },
      { token: 'method', foreground: hex(c.tag) },
      { token: 'class', foreground: hex(c.tag) },
      { token: 'interface', foreground: hex(c.tag) },
      { token: 'type', foreground: hex(c.tag) },
    ],
    colors: {
      'editor.background': hex(c.background),
      'editor.foreground': hex(c.text),
      'editorGutter.background': hex(c.background),
      'editorLineNumber.foreground': hex(c.lineNumber),
      'editorLineNumber.activeForeground': token('--primary'),
      'editorCursor.foreground': token('--primary'),
      'editor.lineHighlightBackground': '#00000000',
      'editor.lineHighlightBorder': '#00000000',
      'editor.selectionBackground': token('--accent-border'),
      'editorIndentGuide.background1': token('--border'),
      'editorError.foreground': hex(c.marker),
      'editorWarning.foreground': token('--warning'),
      'editorOverviewRuler.border': '#00000000',
      'editorWidget.background': token('--popover'),
      'editorWidget.border': token('--border'),
      'editorSuggestWidget.background': token('--popover'),
      'editorSuggestWidget.border': token('--border'),
      'editorSuggestWidget.selectedBackground': token('--accent'),
      'editorHoverWidget.background': token('--popover'),
      'editorHoverWidget.border': token('--border'),
    },
  })
  return THEME_NAME
}
