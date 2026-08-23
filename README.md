# Pressed — print your own labels

> Formerly "pressed" — internal package/module ids (`@pressed/core`, the `pressed`
> template module) keep the old name until the new one settles.

Browser app: **data source → Vue template → preview → printer**. Each part is swappable.
A template is a real `.vue` file with a `<meta>` block; it is compiled and rendered inside a
sandboxed, null-origin iframe and printed either through the browser dialog or as a 1-bit
raster over WebUSB.

```
npm install
npm run dev         # http://localhost:5173
npm test            # vitest, whole monorepo
npm run typecheck   # vue-tsc over packages/core and apps/web
npm run build       # apps/web → apps/web/dist (index.html + runtime.html)
npm run lint        # oxlint
```

## Layout

npm workspaces. No package has a build step — Vite, vitest and vue-tsc read the TypeScript
sources directly.

| Path | What |
|---|---|
| `packages/core` | DOM-free: template loader/compiler/renderer, component library, 1-bit dither, TSPL encoder, imposition, data sources. `runtime/main.ts` is the sandboxed frame script. |
| `apps/web` | The app: shell, views, stores, printers, tokens, `runtime.html`, plus `src/editor` (label-agnostic Vue SFC editor), `src/ui` (generic primitives) and `src/render` (raster + runtime frame). |
| `docs/` | `plan-rebuild.md` (build plan), `design/` (UI spec + tokens + mockups). |
| `spec.md` | Product spec. |

The label is always the same standalone HTML document (`labelDocument`) for preview, print
and rasterizing, so what you see is what prints.

## Template format

```vue
<meta>{ "name": "Spool label", "size": { "width": 60, "height": 40 }, "gap": 2 }</meta>

<snippet name="badge" props="text"><span class="badge">{{ text }}</span></snippet>

<template>
  <div class="title">{{ row.filament.name }}</div>
  <QrCode :value="`spool:${row.id}`" size="16mm" />
</template>

<style>.title { font: 700 13pt system-ui }</style>
```

`row` is available in the markup, and via `import { useRow } from 'pressed'` in
`<script setup>`. Built-in components: `QrCode`, `Barcode`, `Img`, `Fit`. Bundled assets are
referenced as `asset:name` and become data URLs at render time. Templates render to static
HTML — lifecycle hooks, timers and browser APIs raise a purity warning.

## K30F notes (ChiTenk / ChiTeng, 203 dpi, 576 dots max)

- It speaks **TSPL**, not ESC/POS (command set taken from ChiTeng's own CUPS filter,
  `/Library/Printers/CHITENGPrinter/Filter/rastertolabel`). ESC/POS raster jobs stall on the
  first write.
- **WebUSB works** (macOS, Chrome): switch the printer on *before* plugging it in, otherwise
  it enumerates half-dead (VID/PID 0) and `claimInterface` fails. Real IDs: VID `0x28e9`,
  PID `0x029b`, interface 0, bulk OUT/IN endpoint 1. Never leave the device open.
- Profile: `{ dpi: 203, maxDots: 576, gapMm: 2, density: 8 }` in `apps/web/src/printers/types.ts`.
  `SPEED` is model-specific and therefore omitted by default.
- TSPL `BITMAP` bit 1 = white (only implied by the manual's example; confirmed on hardware).
- `<ESC>!?` status polling is best-effort — the K30F does not answer (500 ms timeout).
- Web fonts and external images do not render in the raster path (`<foreignObject>`
  limitation) — bundle them as template assets or use system fonts.

## The runtime frame

`apps/web/runtime.html` loads `@pressed/core/runtime/main.ts` and is embedded as
`<iframe sandbox="allow-scripts" src="/runtime.html">`, so template code runs on a null
origin with no access to the app, its storage or the printer. Because the frame's origin is
opaque, every module script it loads is a cross-origin fetch: the server must send
`Access-Control-Allow-Origin` for `/runtime.html` and its assets (the Vite dev and preview
servers are configured to).
