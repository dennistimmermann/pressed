import { editor } from 'monaco-editor-core'

/**
 * The Monaco theme from design §3.3 — "so the app has one code voice".
 *
 * Two jobs: the fixed token palette from the design table, and the app tokens (`--accent`,
 * `--primary`, `--border`) read off `<html>` at call time so the editor follows the theme
 * toggle. Monaco only understands hex, and some tokens are `oklch()`, so every colour goes
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

/**
 * The editor lives in a pane, so its ground is `--pane` and its code colours are the tokens
 * VISUAL-SPEC §3 names: keyword `--code-keyword`, string `--code-string`, gutter
 * `--faint-foreground`, current line number `--primary`. The remaining Monarch / Volar
 * voices the spec does not name keep the previous pass's hues, as tokens.
 */
const palette = {
  light: {
    background: '--pane',
    tag: '--code-keyword',
    attribute: '--code-keyword',
    string: '--code-string',
    expression: '--code-expression',
    text: '--foreground',
    lineNumber: '--faint-foreground',
    marker: '--destructive',
  },
  dark: {
    background: '--pane',
    tag: '--code-keyword',
    attribute: '--code-keyword',
    string: '--code-string',
    expression: '--code-expression',
    text: '--foreground',
    lineNumber: '--faint-foreground',
    marker: '--destructive',
  },
}

/** A palette entry is either a token name or (for the hues the spec does not fix) a colour. */
const colour = (v: string) => (v.startsWith('--') ? token(v) : hex(v))

export const THEME_NAME = 'sprint'

/** (Re)define the theme for the current `<html>` class. Call again when `.dark` flips. */
export function defineSprintTheme(): string {
  const dark = document.documentElement.classList.contains('dark')
  const c = dark ? palette.dark : palette.light

  editor.defineTheme(THEME_NAME, {
    base: dark ? 'vs-dark' : 'vs',
    inherit: false,
    rules: [
      { token: '', foreground: colour(c.text) },
      { token: 'text', foreground: colour(c.text) },
      { token: 'tag', foreground: colour(c.tag) },
      { token: 'delimiter', foreground: colour(c.attribute) },
      { token: 'attribute.name', foreground: colour(c.attribute) },
      { token: 'attribute.value', foreground: colour(c.string) },
      { token: 'string', foreground: colour(c.string) },
      { token: 'expression', foreground: colour(c.expression) },
      { token: 'comment', foreground: colour(c.lineNumber) },
      // Volar's semantic tokens land on top of the Monarch layer; keep them in the same
      // two voices the design names — code-blue for types, accent for values.
      { token: 'variable', foreground: colour(c.expression) },
      { token: 'property', foreground: colour(c.expression) },
      { token: 'function', foreground: colour(c.tag) },
      { token: 'method', foreground: colour(c.tag) },
      { token: 'class', foreground: colour(c.tag) },
      { token: 'interface', foreground: colour(c.tag) },
      { token: 'type', foreground: colour(c.tag) },
    ],
    colors: {
      'editor.background': colour(c.background),
      'editor.foreground': colour(c.text),
      'editorGutter.background': colour(c.background),
      'editorLineNumber.foreground': colour(c.lineNumber),
      'editorLineNumber.activeForeground': token('--primary'),
      'editorCursor.foreground': token('--primary'),
      'editor.lineHighlightBackground': '#00000000',
      'editor.lineHighlightBorder': '#00000000',
      'editor.selectionBackground': token('--accent'),
      'editorIndentGuide.background1': token('--border'),
      'editorError.foreground': colour(c.marker),
      'editorWarning.foreground': token('--warning'),
      'editorOverviewRuler.border': '#00000000',
      'editorWidget.background': token('--popover'),
      'editorWidget.border': token('--field-border'),
      'editorSuggestWidget.background': token('--popover'),
      'editorSuggestWidget.border': token('--field-border'),
      'editorSuggestWidget.selectedBackground': token('--accent'),
      'editorHoverWidget.background': token('--popover'),
      'editorHoverWidget.border': token('--field-border'),
    },
  })
  return THEME_NAME
}
