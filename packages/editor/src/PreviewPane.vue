<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef, watch } from 'vue'
import type { Loc } from './ast'

/**
 * Canvas & Preview (SPEC §4.5) — one component, two sizes. The host mounts it filling the
 * middle column (Blocks), 326px tall over the editor (Split) or 240px tall above the
 * Inspector (Code); the only differences are props: `handles`, the zoom value it is given
 * back, and the `footnote` under the sheet.
 *
 * The document arrives ready-made from the host and is shown in a `sandbox="allow-scripts"`
 * iframe at its true size, scaled by CSS. Everything drawn *on* the label — outlines, the
 * name tab, resize handles, the drop line — is drawn inside that document by the inspector
 * script below, in literal colours: app tokens must never reach it.
 */
const props = withDefaults(
  defineProps<{
    /** Standalone HTML document, or null when there is nothing to show. */
    document: string | null
    sizeMm: { width: number; height: number }
    mode?: 'rendered' | 'raster'
    /** Data URL of the 1-bit bitmap, shown in `raster` mode. */
    rasterSrc?: string
    state?: 'ok' | 'error' | 'no-data'
    /** Source range of the selected element; gets the 2px outline and the handles. */
    selectedLoc?: Loc | null
    /** Rule mode: every element the selected rule matches, outlined at 1.5px. */
    matchedLocs?: Loc[]
    /** The source range of the scope we are in; everything outside it dims to 32%. */
    scopeRange?: Loc | null
    /** `['label', 'div .title']` — the breadcrumb chip, bottom left. The host owns the words. */
    crumbs?: string[]
    /** Which record the document was rendered from; `total: 0` reads `no data`. */
    row?: { index: number; total: number }
    /** The mono line under the sheet. Empty in Blocks, where it lives in the Status strip. */
    footnote?: string
    /** Resize handles on the selection — Blocks and Split only. */
    handles?: boolean
    /** …and only when the selection's rule can take a width and a height. */
    resizable?: boolean
    /** Nothing in the template yet (E9): the sheet gets a dashed edge. */
    empty?: boolean
    /** `fit`, or a scale factor. Persisted by the host, per mount group (SPEC §6). */
    zoom?: 'fit' | number
  }>(),
  {
    mode: 'rendered', rasterSrc: '', state: 'ok', selectedLoc: null, matchedLocs: () => [],
    scopeRange: null, crumbs: () => [], row: () => ({ index: 0, total: 0 }), footnote: '',
    handles: false, resizable: false, empty: false, zoom: 'fit',
  },
)

const emit = defineEmits<{
  'update:mode': [mode: 'rendered' | 'raster']
  'update:zoom': [zoom: 'fit' | number]
  /** Innermost-first chain of source ranges under the pointer; the host picks the one in scope. */
  select: [locs: Loc[]]
  'enter-scope': [locs: Loc[]]
  reorder: [e: { locs: Loc[]; target: Loc[]; position: 'before' | 'after' | 'inside' }]
  resize: [e: { locs: Loc[]; width: number; height: number | null }]
  step: [by: number]
  /** Once per document: what the browser computes for the enumerated properties, by `data-loc`. */
  'computed-styles': [styles: Record<string, Record<string, string>>]
}>()

const PX_PER_MM = 96 / 25.4
// Literal, never a token: nothing from the app's palette may reach inside the frame
// (CLAUDE.md invariant 3). It is the value of --primary written out by hand, because
// VISUAL-SPEC §4 asks the in-scope outline to read as the accent.
const ACCENT = '#0099ff'

// ---------------------------------------------------------------- the document

/**
 * Never blank the canvas: on a compile error the last good document stays, at 60% with an
 * inline bar, so the user sees what they broke (SPEC §3 E11).
 */
const lastGood = shallowRef<string | null>(null)
watch(
  () => [props.document, props.state] as const,
  ([doc, state]) => { if (doc && state !== 'error') lastGood.value = doc },
  { immediate: true },
)

/**
 * Appended to the host's document. It owns every pointer interaction on the label and paints
 * selection, hover, rule outlines, scope dimming, the name tab, the handles and the drop line.
 * `--u` is 1/scale, so a 2px outline stays 2px on screen at any zoom.
 */
const INSPECTOR = `
<style>
  html, body { overflow: hidden }
  :root { --u: 1 }
  #sprint-ui { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647 }
  #sprint-ui > div { position: absolute; box-sizing: border-box }
  #sprint-ui .tab {
    background: ${ACCENT}; color: #fff; border-radius: calc(3px * var(--u));
    padding: calc(1px * var(--u)) calc(4px * var(--u)); transform: translateY(-100%);
    font: 500 calc(10px * var(--u))/1.4 ui-monospace, monospace; white-space: nowrap;
  }
  #sprint-ui .hd { background: #fff; border: calc(2px * var(--u)) solid ${ACCENT}; pointer-events: auto; cursor: nwse-resize }
  #sprint-ui .drop { background: ${ACCENT} }
  #sprint-ui .into { border: calc(2px * var(--u)) solid ${ACCENT} }
  [data-sprint-hover] { outline: calc(1px * var(--u)) solid ${ACCENT} !important; outline-offset: calc(1px * var(--u)) }
  [data-sprint-match] { outline: calc(1.5px * var(--u)) solid ${ACCENT} !important; outline-offset: calc(1px * var(--u)) }
  [data-sprint-sel] { outline: calc(2px * var(--u)) solid ${ACCENT} !important; outline-offset: calc(3px * var(--u)) }
  [data-sprint-dim] { opacity: 0.32 !important; pointer-events: none }
</style>
<script>
(function () {
  var SEL = '[data-loc],[data-inst]'
  var ui = document.createElement('div'); ui.id = 'sprint-ui'; document.body.appendChild(ui)
  var S = { sel: null, match: [], scope: null, handles: false, resizable: false, tab: '' }
  var drag = null, resize = null, hover = null

  var post = function (m) { parent.postMessage(m, '*') }
  var all = function () { return document.querySelectorAll(SEL) }
  var hit = function (t) { return t && t.closest ? t.closest(SEL) : null }
  var locStr = function (el) { return el.getAttribute('data-loc') || el.getAttribute('data-inst') }
  var nums = function (s) { var p = String(s).split(':'); return [+p[0], +p[1]] }
  var u = function () { return +getComputedStyle(document.documentElement).getPropertyValue('--u') || 1 }
  var find = function (loc) { return loc ? document.querySelectorAll('[data-loc="' + loc + '"],[data-inst="' + loc + '"]') : [] }

  /** Innermost first; a snippet's root carries both its own range and its call site's. */
  function chain(el) {
    var out = []
    for (var n = el; n && n.getAttribute; n = n.parentElement) {
      var a = n.getAttribute('data-loc'); if (a) out.push(a)
      var b = n.getAttribute('data-inst'); if (b) out.push(b)
    }
    return out
  }

  function paint() {
    var els = all(), i, el
    for (i = 0; i < els.length; i++) {
      els[i].removeAttribute('data-sprint-sel')
      els[i].removeAttribute('data-sprint-match')
      els[i].removeAttribute('data-sprint-dim')
    }
    // In a scope: everything outside it dims and stops taking clicks, but stays laid out.
    if (S.scope) {
      var keep = new Set()
      for (i = 0; i < els.length; i++) {
        var p = nums(locStr(els[i]))
        if (p[0] >= S.scope[0] && p[1] <= S.scope[1]) for (var n = els[i]; n; n = n.parentElement) keep.add(n)
      }
      for (i = 0; i < els.length; i++) {
        el = els[i]
        if (keep.has(el) || (el.parentElement && el.parentElement.closest('[data-sprint-dim]'))) continue
        el.setAttribute('data-sprint-dim', '')
      }
    }
    for (i = 0; i < S.match.length; i++) mark(find(S.match[i]), 'data-sprint-match')
    mark(find(S.sel), 'data-sprint-sel')
  }

  function mark(list, attr) { for (var i = 0; i < list.length; i++) list[i].setAttribute(attr, '') }

  function box(cls, x, y, w, h) {
    var d = document.createElement('div')
    d.className = cls
    d.style.left = x + 'px'; d.style.top = y + 'px'
    d.style.width = w + 'px'; d.style.height = h + 'px'
    ui.appendChild(d)
    return d
  }

  /** The name tab and the two corner handles — screen-sized, whatever the zoom. */
  function overlay() {
    ui.innerHTML = ''
    var el = find(S.sel)[0]
    if (!el || el.hasAttribute('data-sprint-dim') || drag) return
    var r = el.getBoundingClientRect(), k = u()
    var tab = document.createElement('div')
    tab.className = 'tab'; tab.textContent = S.tab
    tab.style.left = (r.left - 3 * k) + 'px'; tab.style.top = (r.top - 4 * k) + 'px'
    ui.appendChild(tab)
    // An element at the very top of the sheet would push its tab off the document: keep it in.
    if (r.top - 4 * k - tab.offsetHeight < 0) { tab.style.transform = 'none'; tab.style.top = r.top + 'px' }
    if (!S.handles || !S.resizable) return
    var s = 9 * k
    box('hd', r.right - s / 2, r.top - s / 2, s, s).setAttribute('data-k', 'tr')
    box('hd', r.right - s / 2, r.bottom - s / 2, s, s).setAttribute('data-k', 'br')
  }

  function setHover(el) {
    if (hover === el) return
    if (hover) hover.removeAttribute('data-sprint-hover')
    hover = el && !el.hasAttribute('data-sprint-sel') ? el : null
    if (hover) hover.setAttribute('data-sprint-hover', '')
  }

  /** What the pointer is over, skipping the dragged element and its own descendants. */
  function under(x, y, skip) {
    var el = hit(document.elementFromPoint(x, y))
    while (el && (el === skip || skip.contains(el))) el = el.parentElement ? hit(el.parentElement) : null
    if (!el || el.hasAttribute('data-sprint-dim')) return null
    var r = el.getBoundingClientRect()
    var into = !el.children.length && !el.textContent.trim() && r.height > 8
    var t = (y - r.top) / (r.height || 1)
    return { el: el, pos: into && t > 0.25 && t < 0.75 ? 'inside' : t < 0.5 ? 'before' : 'after', rect: r }
  }

  function showDrop(t) {
    ui.innerHTML = ''
    if (!t) return
    var r = t.rect, k = u()
    if (t.pos === 'inside') box('into', r.left, r.top, r.width, r.height)
    else box('drop', r.left, t.pos === 'before' ? r.top - k : r.bottom - k, r.width, 2 * k)
  }

  addEventListener('pointerover', function (e) { if (!drag && !resize) setHover(hit(e.target)) })
  addEventListener('pointerout', function () { if (!drag && !resize) setHover(null) })

  addEventListener('pointerdown', function (e) {
    if (e.button) return
    var h = e.target.closest && e.target.closest('.hd')
    if (h) return startResize(h, e)
    var el = hit(e.target)
    if (!el) return
    e.preventDefault()
    setHover(null)
    drag = { el: el, x: e.clientX, y: e.clientY, on: false, t: null }
    document.documentElement.setPointerCapture(e.pointerId)
  })

  addEventListener('pointermove', function (e) {
    if (resize) return doResize(e)
    if (!drag) return
    if (!drag.on && Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) < 4) return
    drag.on = true
    drag.t = under(e.clientX, e.clientY, drag.el)
    showDrop(drag.t)
  })

  addEventListener('pointerup', function (e) {
    if (resize) return endResize()
    if (!drag) return
    var d = drag; drag = null
    if (!d.on) post({ type: 'select', locs: chain(d.el) })
    else if (d.t) post({ type: 'reorder', locs: chain(d.el), target: chain(d.t.el), position: d.t.pos })
    overlay()
  })
  addEventListener('pointercancel', function () { drag = null; resize = null; overlay() })

  addEventListener('dblclick', function (e) {
    var el = hit(e.target)
    if (el) post({ type: 'dblclick', locs: chain(el) })
  })

  // Wheel over the frame never reaches the host document, so hand it over: pan, or zoom with ⌥.
  addEventListener('wheel', function (e) {
    e.preventDefault()
    post({ type: 'wheel', dx: e.deltaX, dy: e.deltaY, alt: e.altKey })
  }, { passive: false })

  /**
   * The frame is unscaled inside (1mm is always 96/25.4px there), so a pointer delta is a
   * real delta: what the user drags on screen is what the rule gets, at any zoom.
   */
  function startResize(h, e) {
    var el = find(S.sel)[0]
    if (!el) return
    e.preventDefault()
    var cs = getComputedStyle(el)
    resize = { el: el, k: h.getAttribute('data-k'), x: e.clientX, y: e.clientY, w: parseFloat(cs.width), h: parseFloat(cs.height), moved: false }
    document.documentElement.setPointerCapture(e.pointerId)
  }
  function doResize(e) {
    resize.moved = true
    resize.el.style.width = Math.max(2, resize.w + (e.clientX - resize.x)) + 'px'
    if (resize.k === 'br') resize.el.style.height = Math.max(2, resize.h + (e.clientY - resize.y)) + 'px'
    overlay()
  }
  function endResize() {
    var r = resize; resize = null
    if (!r.moved) return overlay()
    var mm = function (px) { return Math.max(0.5, Math.round(px * 25.4 / 96 * 2) / 2) }
    var w = parseFloat(r.el.style.width), h = parseFloat(r.el.style.height)
    r.el.style.width = ''; r.el.style.height = '' // the real render replaces the preview
    post({ type: 'resize', locs: chain(r.el), width: mm(w), height: r.k === 'br' && h ? mm(h) : null })
  }

  /**
   * What the browser actually computes for the enumerated STYLE controls — the only way out of a
   * null-origin frame is a message, so it is taken here and posted once per document (the host
   * regenerates the document on every render, so there is nothing to keep up to date). Only these
   * properties: no lengths, no colours, so the payload stays a few hundred bytes.
   */
  var COMPUTED = ['display', 'flex-direction', 'justify-content', 'align-items', 'flex-wrap',
    'position', 'text-align', 'text-transform', 'font-weight', 'font-style', 'text-decoration-line',
    'overflow', 'white-space', 'border-style']
  addEventListener('load', function () {
    var els = all(), out = {}, i, j
    for (i = 0; i < els.length; i++) {
      var cs = getComputedStyle(els[i]), v = {}
      for (j = 0; j < COMPUTED.length; j++) v[COMPUTED[j]] = cs.getPropertyValue(COMPUTED[j])
      // A snippet's root carries both ranges and has one computed style: file both keys at it.
      var a = els[i].getAttribute('data-loc'); if (a) out[a] = v
      var b = els[i].getAttribute('data-inst'); if (b) out[b] = v
    }
    post({ type: 'sprint-computed', styles: out })
  })

  addEventListener('message', function (e) {
    var d = e.data || {}
    if (d.type !== 'sprint-state') return
    S.sel = d.sel; S.match = d.match || []; S.scope = d.scope
    S.handles = !!d.handles; S.resizable = !!d.resizable; S.tab = d.tab || ''
    document.documentElement.style.setProperty('--u', d.u)
    paint(); overlay()
  })
})()
<\/script>`

const srcdoc = computed(() => {
  const doc = props.state === 'error' ? lastGood.value : (props.document ?? lastGood.value)
  return doc ? doc + INSPECTOR : null
})

// ---------------------------------------------------------------- zoom & pan

const body = useTemplateRef('body')
const fitScale = ref(1)
const scale = computed(() => (props.zoom === 'fit' ? fitScale.value : props.zoom))
const sheet = computed(() => ({
  width: `${props.sizeMm.width * PX_PER_MM * scale.value}px`,
  height: `${props.sizeMm.height * PX_PER_MM * scale.value}px`,
}))

function recomputeFit() {
  const el = body.value
  if (!el) return
  const padding = 32 // the stage's own; the footnote line under the sheet costs another 28
  const w = (el.clientWidth - padding) / (props.sizeMm.width * PX_PER_MM)
  const h = (el.clientHeight - padding - (props.footnote ? 28 : 0)) / (props.sizeMm.height * PX_PER_MM)
  fitScale.value = Math.max(0.1, Math.min(w, h))
}

/** Steps of 0.5 in ×0.5 – ×8 (SPEC §4.5). */
const stepZoom = (by: number) =>
  emit('update:zoom', Math.min(8, Math.max(0.5, Math.round((scale.value + by) * 2) / 2)))

function onWheel(e: { deltaX: number; deltaY: number; altKey?: boolean; alt?: boolean; preventDefault?: () => void }) {
  if (e.altKey ?? e.alt) {
    e.preventDefault?.()
    return stepZoom(e.deltaY < 0 ? 0.5 : -0.5)
  }
  body.value?.scrollBy(e.deltaX, e.deltaY) // plain scroll = pan
}

let observer: ResizeObserver | undefined
onMounted(() => {
  observer = new ResizeObserver(recomputeFit)
  observer.observe(body.value!)
  recomputeFit()
  addEventListener('message', onFrameMessage)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  removeEventListener('message', onFrameMessage)
})
watch(() => props.sizeMm, recomputeFit, { deep: true })

// ---------------------------------------------------------------- the frame

const frame = useTemplateRef('frame')
const toLoc = (s: string): Loc => {
  const [start, end] = s.split(':').map(Number)
  return { start, end }
}

function onFrameMessage(event: MessageEvent) {
  if (event.source !== frame.value?.contentWindow) return
  const d = event.data as { type?: string; locs?: string[]; target?: string[]; position?: 'before' | 'after' | 'inside'; width?: number; height?: number | null; dx?: number; dy?: number; alt?: boolean; styles?: Record<string, Record<string, string>> }
  const locs = (a?: string[]) => (a ?? []).map(toLoc)
  if (d?.type === 'select') emit('select', locs(d.locs))
  else if (d?.type === 'sprint-computed') emit('computed-styles', d.styles ?? {})
  else if (d?.type === 'dblclick') emit('enter-scope', locs(d.locs))
  else if (d?.type === 'reorder') emit('reorder', { locs: locs(d.locs), target: locs(d.target), position: d.position! })
  else if (d?.type === 'resize') emit('resize', { locs: locs(d.locs), width: d.width!, height: d.height ?? null })
  else if (d?.type === 'wheel') onWheel({ deltaX: d.dx!, deltaY: d.dy!, alt: d.alt })
}

const key = (loc?: Loc | null) => (loc ? `${loc.start}:${loc.end}` : null)

/** Push state into the frame instead of re-rendering it — no flash, no reload. */
function pushState() {
  frame.value?.contentWindow?.postMessage(
    {
      type: 'sprint-state',
      sel: key(props.selectedLoc),
      match: props.matchedLocs.map((l) => key(l)),
      scope: props.scopeRange ? [props.scopeRange.start, props.scopeRange.end] : null,
      handles: props.handles,
      resizable: props.resizable,
      tab: props.crumbs.at(-1) ?? '',
      u: 1 / scale.value,
    },
    '*',
  )
}
watch(
  () => [props.selectedLoc, props.matchedLocs, props.scopeRange, props.handles, props.resizable, props.crumbs, scale.value],
  pushState,
  { deep: true },
)
</script>

<template>
  <section class="pane">
    <div ref="body" class="body dot-grid" @wheel="onWheel">
      <div class="stage">
        <div class="sheet" :class="{ stale: state === 'error', empty }" :style="sheet">
          <img
            v-if="mode === 'raster'"
            class="raster"
            :src="rasterSrc"
            :width="sheet.width"
            alt="1-bit raster preview"
          />
          <iframe
            v-else-if="srcdoc"
            ref="frame"
            sandbox="allow-scripts"
            title="Canvas"
            :srcdoc="srcdoc"
            :style="{
              width: `${sizeMm.width}mm`,
              height: `${sizeMm.height}mm`,
              transform: `scale(${scale})`,
            }"
            @load="pushState"
          />
        </div>
        <p v-if="state === 'error'" class="bar">compile error — showing last good render</p>
        <p v-if="footnote" class="foot">{{ footnote }}</p>
      </div>
    </div>

    <!-- Toolbar chips float 10px from the pane edges (SPEC §4.5); they never scroll away. -->
    <div class="chips tl">
      <button type="button" class="chip" :class="{ on: mode === 'rendered' }" @click="emit('update:mode', 'rendered')">Rendered</button>
      <button type="button" class="chip" :class="{ on: mode === 'raster' }" @click="emit('update:mode', 'raster')">Raster 1-bit</button>
      <span v-if="!row.total" class="chip mono muted">no data</span>
      <span v-else class="chip mono step">
        row {{ row.index + 1 }} / {{ row.total }}
        <button type="button" aria-label="previous row" @click="emit('step', -1)">‹</button>
        <button type="button" aria-label="next row" @click="emit('step', 1)">›</button>
      </span>
    </div>

    <div class="chips tr">
      <button type="button" class="chip sq" aria-label="zoom out" @click="stepZoom(-0.5)">−</button>
      <span class="mono zoom">×{{ scale.toFixed(1) }}</span>
      <button type="button" class="chip sq" aria-label="zoom in" @click="stepZoom(0.5)">+</button>
      <button type="button" class="chip" :class="{ on: zoom === 'fit' }" @click="emit('update:zoom', 'fit')">Fit</button>
    </div>

    <!-- The footnote owns the bottom of the pane in the Preview; the Canvas gets the breadcrumb. -->
    <div v-if="crumbs.length && !footnote" class="chips bl">
      <span class="chip mono crumb" :class="{ scoped: !!scopeRange }">
        <template v-for="(c, i) in crumbs" :key="i">
          <span v-if="i" class="sep"> › </span>{{ c.split(' ')[0] }}<span class="cls">{{ c.slice(c.split(' ')[0].length) }}</span>
        </template>
      </span>
    </div>
  </section>
</template>

<style scoped>
.pane {
  position: relative;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.body {
  height: 100%;
  display: flex;
  justify-content: safe center;
  align-items: safe center;
  overflow: auto;
}
.stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 16px;
}

/* The sheet is white, always — the rendered label is never themed (invariant 3). Its edge
   and shadow are drawn *outside* the frame, so they are the `--sheet-*` tokens. */
.sheet {
  position: relative;
  overflow: hidden;
  background: var(--sheet);
  border: 1px solid var(--sheet-border);
  box-shadow: var(--sheet-shadow);
}
.sheet.empty {
  border-style: dashed;
}
/* E11: the last good render stays, at 60%, with the bar under it. Never blank. */
.sheet.stale {
  opacity: 0.6;
}
.sheet iframe {
  display: block;
  border: 0;
  transform-origin: 0 0;
}
.raster {
  display: block;
  width: 100%;
  height: auto;
  image-rendering: pixelated;
}

.bar,
.foot {
  margin: 0;
  white-space: nowrap;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 10.5px;
  color: var(--meta-foreground);
  text-align: center;
}
.bar {
  color: var(--destructive);
}

.chips {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 5px;
}
.tl { top: 10px; left: 10px }
.tr { top: 10px; right: 10px }
.bl { bottom: 10px; left: 10px }

.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 1px solid var(--field-border);
  border-radius: var(--radius-control);
  background: var(--pane);
  font-size: 10px;
  font-weight: 450;
  line-height: 1;
  color: var(--muted-foreground);
  transition: background-color 120ms ease-out, border-color 120ms ease-out;
}
button.chip:hover {
  background: var(--field);
}
/* Selection is --accent plus its border, never a fill (invariant 1). */
.chip.on {
  background: var(--accent);
  border-color: var(--primary);
  color: var(--accent-foreground);
}
.chip.sq {
  width: 22px;
  height: 22px;
  justify-content: center;
  padding: 0;
}
.mono {
  font-family: var(--font-mono, ui-monospace, monospace);
}
.muted {
  color: var(--muted-foreground);
}
.zoom {
  padding: 0 2px;
  font-size: 10.5px;
  color: var(--muted-foreground);
}
.step button {
  padding: 0 2px;
  color: var(--muted-foreground);
}
.step button:hover {
  color: var(--foreground);
}

.crumb {
  padding: 5px 9px;
  border-radius: var(--radius-control);
  font-size: 10.5px;
}
.crumb.scoped {
  background: var(--accent);
  border-color: var(--primary);
  color: var(--accent-foreground);
}
.sep {
  color: var(--muted-foreground);
  opacity: 0.7;
}
.crumb .cls {
  color: var(--accent-link);
}
.crumb.scoped .cls {
  color: inherit;
  font-weight: 600;
}
</style>
