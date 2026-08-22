// 12 × 12, drawn on a 1px grey outline: the thick pair is the dimension the field edits.
const ink = 'stroke="var(--muted-foreground)"'
const fill = 'fill="var(--splitter-grip)" stroke="none"'

export const ICON = {
  cols: `<path d="M2.5 1.5v9" ${ink} stroke-width="2"/><path d="M6 1.5v9" ${ink} stroke-width="2"/><path d="M9.5 1.5v9" ${ink} stroke-width="2"/>`,
  rows: `<path d="M1.5 2.5h9" ${ink} stroke-width="2"/><path d="M1.5 6h9" ${ink} stroke-width="2"/><path d="M1.5 9.5h9" ${ink} stroke-width="2"/>`,
  gapH: `<rect x="1" y="1.5" width="3.5" height="9" ${fill}/><rect x="7.5" y="1.5" width="3.5" height="9" ${fill}/><path d="M6 2v8" ${ink} stroke-width="1.5" stroke-dasharray="1.5 1.5"/>`,
  gapV: `<rect x="1.5" y="1" width="9" height="3.5" ${fill}/><rect x="1.5" y="7.5" width="9" height="3.5" ${fill}/><path d="M2 6h8" ${ink} stroke-width="1.5" stroke-dasharray="1.5 1.5"/>`,
  marginTB: `<rect x="1.5" y="1.5" width="9" height="9"/><path d="M1.5 1.5h9" ${ink} stroke-width="2"/><path d="M1.5 10.5h9" ${ink} stroke-width="2"/>`,
  marginTop: `<rect x="1.5" y="1.5" width="9" height="9"/><path d="M1.5 1.5h9" ${ink} stroke-width="2"/>`,
  marginLeft: `<rect x="1.5" y="1.5" width="9" height="9"/><path d="M1.5 1.5v9" ${ink} stroke-width="2"/>`,
  centerH: `<rect x="1.5" y="1.5" width="9" height="9"/><path d="M6 1.5v9" ${ink} stroke-width="2"/>`,
  centerV: `<rect x="1.5" y="1.5" width="9" height="9"/><path d="M1.5 6h9" ${ink} stroke-width="2"/>`,
  marginSides: `<rect x="1.5" y="1.5" width="9" height="9"/><path d="M1.5 1.5v9" ${ink} stroke-width="2"/><path d="M10.5 1.5v9" ${ink} stroke-width="2"/>`,
  advance: `<rect x="1.5" y="1" width="9" height="3" ${fill}/><rect x="1.5" y="8" width="9" height="3" ${fill}/><path d="M6 4.8v2.4M4.9 6l1.1 1.2L7.1 6" ${ink} stroke-width="1"/>`,
}
