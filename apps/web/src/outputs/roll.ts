import { rollFit } from '@sprint/core'
import type { Output } from './index'
import RollPreview from './RollPreview.vue'
import RollSettings from './RollSettings.vue'

/** Labels imposed set by set on a continuous roll — what a label printer eats. */
export const rollOutput: Output = {
  id: 'roll',
  label: 'Roll',
  Settings: RollSettings,
  Preview: RollPreview,
  plan(print, size, labels) {
    const { perSet, sets, lengthM } = rollFit(print.roll, size)
    return [`${perSet}-up →`, ` ${sets(labels)} sets ≈ ${lengthM(labels).toFixed(2)} m of roll`]
  },
}
