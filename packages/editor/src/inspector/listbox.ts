import { nextTick, ref, watch, type Ref } from 'vue'

/**
 * Arrow-key navigation for the component and variable lists (design §4: `role="listbox"`,
 * arrows move, Enter inserts). The list keeps DOM focus; the active option is pointed at with
 * `aria-activedescendant`, so there is exactly one tab stop per pane.
 */
export function useListNav(count: Ref<number>, idPrefix: string, onEnter: (index: number) => void) {
  const active = ref(0)

  watch(count, (n) => {
    if (active.value >= n) active.value = Math.max(0, n - 1)
  })

  function move(to: number) {
    active.value = Math.min(Math.max(to, 0), count.value - 1)
    nextTick(() => document.getElementById(`${idPrefix}-${active.value}`)?.scrollIntoView({ block: 'nearest' }))
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown') move(active.value + 1)
    else if (event.key === 'ArrowUp') move(active.value - 1)
    else if (event.key === 'Home') move(0)
    else if (event.key === 'End') move(count.value - 1)
    else if (event.key === 'Enter') onEnter(active.value)
    else return
    event.preventDefault()
  }

  return { active, onKeydown, optionId: (index: number) => `${idPrefix}-${index}` }
}
