import type { Icon } from './types'

/** The prefix is forced: Vue resolves `<table>`/`<map>`/`<link>` as HTML before a component (plan decision 1). */
export const iconSnippetName = (name: string) => `icon-${name}`

/**
 * A *shorthand* snippet body — no `<template>` wrapper, which is how the loader tells the two
 * apart. 4 mm is the default size and it sits on the root `<svg>`, so an instance's `class`
 * falls through to it and `.big { width: 6mm }` resizes that one instance.
 */
export const iconSnippetBody = (icon: Icon) =>
  `<svg viewBox="${icon.viewBox}" width="4mm" height="4mm">\n  ${icon.body}\n</svg>`
