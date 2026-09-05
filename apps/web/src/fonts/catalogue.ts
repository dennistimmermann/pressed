/**
 * The bundled font set (spec §4.1): a template names a family, the app ships the faces. Every
 * face is a latin-subset woff2 from its `@fontsource` package, reached through Vite as a URL and
 * fetched only when a label names the family — nothing here weighs on the app bundle.
 *
 * Adding a font: install `@fontsource/<id>`, add its row to FAMILIES and its faces to the glob.
 */
export type Family = { id: string; family: string; role: string }

export const FAMILIES: Family[] = [
  { id: 'ibm-plex-sans', family: 'IBM Plex Sans', role: 'sans, the default' },
  { id: 'ibm-plex-mono', family: 'IBM Plex Mono', role: 'mono, the machine font' },
  { id: 'tinos', family: 'Tinos', role: 'Times' },
  { id: 'nunito', family: 'Nunito', role: 'rounded sans' },
  { id: 'montserrat', family: 'Montserrat', role: 'geometric sans' },
  { id: 'oswald', family: 'Oswald', role: 'condensed' },
  { id: 'bebas-neue', family: 'Bebas Neue', role: 'display caps' },
  { id: 'anton', family: 'Anton', role: 'display, heavy' },
  { id: 'roboto-slab', family: 'Roboto Slab', role: 'slab serif' },
  { id: 'playfair-display', family: 'Playfair Display', role: 'elegant serif' },
  { id: 'courier-prime', family: 'Courier Prime', role: 'typewriter' },
  { id: 'special-elite', family: 'Special Elite', role: 'worn typewriter' },
  { id: 'allerta-stencil', family: 'Allerta Stencil', role: 'stencil' },
  { id: 'pacifico', family: 'Pacifico', role: 'brush script' },
  { id: 'lobster', family: 'Lobster', role: 'bold script' },
  { id: 'dancing-script', family: 'Dancing Script', role: 'formal script' },
  { id: 'caveat', family: 'Caveat', role: 'handwriting' },
  { id: 'permanent-marker', family: 'Permanent Marker', role: 'marker' },
  { id: 'comic-neue', family: 'Comic Neue', role: 'comic' },
  { id: 'press-start-2p', family: 'Press Start 2P', role: 'pixel' },
  { id: 'vt323', family: 'VT323', role: 'terminal pixel' },
]

// Relative, because Vite's glob resolves no bare specifiers: four levels up is the repo root,
// where the workspace hoists node_modules. Literal strings only — the glob is read at build time.
const FILES = import.meta.glob(
  [
    '../../../../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2',
    '../../../../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-italic.woff2',
    '../../../../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2',
    '../../../../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-700-normal.woff2',
    '../../../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2',
    '../../../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-700-normal.woff2',
    '../../../../node_modules/@fontsource/tinos/files/tinos-latin-400-normal.woff2',
    '../../../../node_modules/@fontsource/tinos/files/tinos-latin-400-italic.woff2',
    '../../../../node_modules/@fontsource/tinos/files/tinos-latin-700-normal.woff2',
    '../../../../node_modules/@fontsource/nunito/files/nunito-latin-400-normal.woff2',
    '../../../../node_modules/@fontsource/nunito/files/nunito-latin-700-normal.woff2',
    '../../../../node_modules/@fontsource/nunito/files/nunito-latin-900-normal.woff2',
    '../../../../node_modules/@fontsource/montserrat/files/montserrat-latin-400-normal.woff2',
    '../../../../node_modules/@fontsource/montserrat/files/montserrat-latin-700-normal.woff2',
    '../../../../node_modules/@fontsource/oswald/files/oswald-latin-400-normal.woff2',
    '../../../../node_modules/@fontsource/oswald/files/oswald-latin-700-normal.woff2',
    '../../../../node_modules/@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff2',
    '../../../../node_modules/@fontsource/anton/files/anton-latin-400-normal.woff2',
    '../../../../node_modules/@fontsource/roboto-slab/files/roboto-slab-latin-400-normal.woff2',
    '../../../../node_modules/@fontsource/roboto-slab/files/roboto-slab-latin-700-normal.woff2',
    '../../../../node_modules/@fontsource/playfair-display/files/playfair-display-latin-400-normal.woff2',
    '../../../../node_modules/@fontsource/playfair-display/files/playfair-display-latin-400-italic.woff2',
    '../../../../node_modules/@fontsource/playfair-display/files/playfair-display-latin-700-normal.woff2',
    '../../../../node_modules/@fontsource/courier-prime/files/courier-prime-latin-400-normal.woff2',
    '../../../../node_modules/@fontsource/courier-prime/files/courier-prime-latin-700-normal.woff2',
    '../../../../node_modules/@fontsource/special-elite/files/special-elite-latin-400-normal.woff2',
    '../../../../node_modules/@fontsource/allerta-stencil/files/allerta-stencil-latin-400-normal.woff2',
    '../../../../node_modules/@fontsource/pacifico/files/pacifico-latin-400-normal.woff2',
    '../../../../node_modules/@fontsource/lobster/files/lobster-latin-400-normal.woff2',
    '../../../../node_modules/@fontsource/dancing-script/files/dancing-script-latin-400-normal.woff2',
    '../../../../node_modules/@fontsource/dancing-script/files/dancing-script-latin-700-normal.woff2',
    '../../../../node_modules/@fontsource/caveat/files/caveat-latin-400-normal.woff2',
    '../../../../node_modules/@fontsource/caveat/files/caveat-latin-700-normal.woff2',
    '../../../../node_modules/@fontsource/permanent-marker/files/permanent-marker-latin-400-normal.woff2',
    '../../../../node_modules/@fontsource/comic-neue/files/comic-neue-latin-400-normal.woff2',
    '../../../../node_modules/@fontsource/comic-neue/files/comic-neue-latin-700-normal.woff2',
    '../../../../node_modules/@fontsource/press-start-2p/files/press-start-2p-latin-400-normal.woff2',
    '../../../../node_modules/@fontsource/vt323/files/vt323-latin-400-normal.woff2',
  ],
  { query: '?url', import: 'default' },
) as Record<string, () => Promise<string>>

export type Face = { family: string; weight: number; style: 'normal' | 'italic'; url: () => Promise<string> }

const FILE = /@fontsource\/([\w-]+)\/files\/\1-latin-(\d+)-(normal|italic)\.woff2$/

export const FACES: Face[] = Object.entries(FILES).flatMap(([path, url]) => {
  const m = FILE.exec(path)
  const family = m && FAMILIES.find((f) => f.id === m[1])
  return family ? [{ family: family.family, weight: Number(m[2]), style: m[3] as Face['style'], url }] : []
})

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

export const isBundled = (family: string) => FAMILIES.some((f) => same(f.family, family))
export const facesOf = (family: string) => FACES.filter((f) => same(f.family, family))
export const weightsOf = (family: string) => [...new Set(facesOf(family).map((f) => f.weight))].sort((a, b) => a - b)
