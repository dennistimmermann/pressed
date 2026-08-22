// @/ui — the pane design system: the recipes every settings pane and preview is built from.
// Generic by contract (slots and props only), styled from `tokens.css` alone, and a leaf of the
// dependency graph: it knows nothing of CSS rules, millimetres, printers or labels.

export { default as PaneSection } from './PaneSection.vue'
export { default as Labeled } from './Labeled.vue'
export { default as Field } from './Field.vue'
export { default as Seg } from './Seg.vue'
export { default as ViewChip } from './ViewChip.vue'
export { default as Trough } from './Trough.vue'
export { default as StatusBar } from './StatusBar.vue'
export { default as Tabs } from './Tabs.vue'
export { anchorMenu } from './anchor'
export type { Segment } from './Seg.vue'
