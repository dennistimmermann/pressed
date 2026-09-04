import { computed } from 'vue'
import { fromIconify, fromSvg, kebab, type IconifyJSON } from '@/icons/iconify'
import { pressed } from '@/icons/pressed'
import { tabler } from '@/icons/tabler'
import type { Icon, IconSet, Rejection } from '@/icons/types'
import { tx } from './db'
import { tabs } from './editor/state'

/** Mine is app-wide, not per-file: a *library* is reused across templates (plan decision 3). */
const mine: IconSet = {
  id: 'mine',
  label: 'Mine',
  load: () => tx<Icon[]>('icons', 'readonly', (s) => s.getAll()),
}

/** Tab order. */
export const iconSets: IconSet[] = [tabler, mine, pressed]

/**
 * `.svg` and Iconify `.json` in, sanitised icons out. Nothing reaches IndexedDB unsanitised —
 * that is what lets the viewer render a body with `v-html`.
 */
export async function importToMine(files: File[]): Promise<{ added: number; rejected: Rejection[] }> {
  const icons: Icon[] = []
  const rejected: Rejection[] = []

  for (const file of files) {
    const text = await file.text()
    if (file.name.toLowerCase().endsWith('.json')) {
      let json: IconifyJSON
      try {
        json = JSON.parse(text) as IconifyJSON
      } catch {
        rejected.push({ name: file.name, reason: 'is not valid JSON' })
        continue
      }
      // The prefix is dropped: Mine is one flat namespace, however many sets it was built from.
      const out = fromIconify(json)
      icons.push(...out.icons)
      rejected.push(...out.rejected)
    } else {
      const out = fromSvg(kebab(file.name.replace(/\.svg$/i, '')), text)
      if ('icon' in out) icons.push(out.icon)
      else rejected.push({ name: file.name, reason: out.reason })
    }
  }

  // Same name overwrites: a library replaces, it does not version.
  for (const icon of icons) await tx('icons', 'readwrite', (s) => s.put(icon))
  return { added: icons.length, rejected }
}

/** Rename inside the library. Same-name rule as the import: the new name simply overwrites. */
export async function renameInMine(name: string, next: string): Promise<void> {
  const id = kebab(next)
  const icon = await tx<Icon | undefined>('icons', 'readonly', (s) => s.get(name))
  if (!id || id === name || !icon) return
  await tx('icons', 'readwrite', (s) => s.put({ ...icon, name: id }))
  await removeFromMine(name)
}

export async function removeFromMine(name: string): Promise<void> {
  await tx('icons', 'readwrite', (s) => s.delete(name))
}

/** Which icon snippets the open file already has — the viewer's `on` tiles. */
export const present = computed(() => new Set(tabs.value.snippets.map((s) => s.name)))
