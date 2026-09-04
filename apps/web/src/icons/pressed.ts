import type { Icon, IconSet } from './types'

/**
 * Ours, hand-drawn: the marks a *label* needs and a general icon set does not draw — screw
 * heads, filament and material codes, the printed-goods hazards. On the same 24 grid as Tabler,
 * authored in a later design pass. Empty until then; the tab shows its empty state.
 */
const PRESSED: Icon[] = []

export const pressed: IconSet = { id: 'pressed', label: 'Pressed', load: async () => PRESSED }
