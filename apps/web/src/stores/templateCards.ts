/**
 * The cards the Templates dialog draws — one list, two callers: the Editor manages the library
 * with it, the Data view picks a template out of it. The thumbnail of a template is compiled
 * once and cached here, so opening the dialog from either side costs the same nothing.
 */
import { computed, ref, toRaw } from 'vue'
import { parseMeta } from '@pressed/core/template/meta.ts'
import { labelDocument } from '@pressed/core/template/label.ts'
import { runtime } from '@/render/runtime-client'
import { bundled, isBundled, templateName, templates } from './templates'

export const allTemplates = computed(() => [...templates.mine, ...bundled])

/** `60 × 40` — the size axis the dialog's filter rail groups by, and half its meta line. */
const sizeText = (source: string) => {
  const { width, height } = parseMeta(source).meta.size
  return `${width} × ${height}`
}

const thumbnails = ref<Record<string, string>>({})

/** Mine first: the library is the user's, the built-ins are the floor under it. */
export const templateCards = computed(() =>
  allTemplates.value.map((t) => ({
    id: t.id,
    name: templateName(t),
    // The kind is the section eyebrow now, so it is not repeated here (F24).
    meta: `${sizeText(t.source)} mm`,
    media: sizeText(t.source),
    kind: (isBundled(t.id) ? 'built-in' : 'mine') as 'built-in' | 'mine',
    assetsSummary: Object.keys(t.assets).length ? `${Object.keys(t.assets).length} assets` : undefined,
    thumbnail: thumbnails.value[t.id],
    size: parseMeta(t.source).meta.size,
  })),
)

// ponytail: one compile per template, sequential, only when the dialog opens. Cache it in
// IndexedDB if the library ever grows past a few dozen.
export async function ensureThumbnails() {
  for (const t of allTemplates.value) {
    if (thumbnails.value[t.id]) continue
    try {
      // toRaw: a Vue proxy cannot be structured-cloned across postMessage — the throw landed
      // in the catch below and user-saved templates silently never got a thumbnail.
      const result = await runtime().render({ source: t.source, assets: toRaw(t.assets), rows: [] })
      if (result.html[0] != null)
        thumbnails.value[t.id] = labelDocument({ html: result.html[0], css: result.css }, result.meta.size, false, result.meta.margin ?? 0)
    } catch { /* a template that will not compile simply has no thumbnail */ }
  }
}
