import { ref } from 'vue'

export type View = 'data' | 'editor' | 'printer'

/** Which view is on screen. A store, not App state, so any pane can send you elsewhere. */
export const view = ref<View>('editor')
