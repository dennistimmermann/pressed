// @/ui — the closed primitive set (harmonize/Components board). Every surface in the app is
// built from these and nothing else. Generic by contract (slots and props only), styled from
// `tokens.css` alone, and a leaf of the dependency graph: it knows nothing of CSS rules,
// millimetres, printers or labels.

export { default as Button } from './Button.vue'
export { default as PaneSection } from './PaneSection.vue'
export { default as PaneRail } from './PaneRail.vue'
export { default as Labeled } from './Labeled.vue'
export { default as Field } from './Field.vue'
export { default as Seg } from './Seg.vue'
export { default as Chip } from './Chip.vue'
export { default as Trough } from './Trough.vue'
export { default as StatusBar } from './StatusBar.vue'
export { default as Tabs } from './Tabs.vue'
export { default as Menu } from './Menu.vue'
export { default as Picker } from './Picker.vue'
export { default as AddRow } from './AddRow.vue'
export { default as EmptyState } from './EmptyState.vue'
export { default as ConfirmDialog } from './ConfirmDialog.vue'
export { default as Library } from './Library.vue'
export { anchorMenu } from './anchor'
export type { Segment } from './Seg.vue'
export type { Facet } from './Library.vue'
export type { MenuItem } from './Menu.vue'
export type { PickerRow } from './Picker.vue'
export type { StatusCell } from './StatusBar.vue'
