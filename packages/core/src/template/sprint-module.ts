import { inject } from 'vue'
import type { Row } from '../types'

/**
 * The `sprint` module template code imports from. It exists twice on purpose:
 * as a real module (so the library `.vue` files compile under Vite/vue-tsc, via the
 * `sprint` alias) and as an entry in `__modules__` at runtime — same file, same exports.
 * The runtime adds the compiled library components to it after compiling them.
 */
export function useRow(): Row {
  return inject<Row>('row', {})
}

export { code128bBars } from '../library/code128'
