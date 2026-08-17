/**
 * TSPL / TSPL2 encoder — the subset needed to print a raster label.
 *
 * Reference: TSC "TSPL/TSPL2 Programming Language" Programming Manual (TSC Auto ID, 2014 ed.).
 * Every command below quotes the manual's syntax; ranges are validated per the manual and
 * throw before anything is sent. No DOM, no I/O — pure bytes in, bytes out.
 *
 * Wire format (manual §"Syntax conventions"): ASCII commands, each terminated by CR LF (0x0D 0x0A).
 * BITMAP data is raw binary immediately after the trailing comma, then CR LF.
 */

const CRLF = '\r\n'
const enc = new TextEncoder()

/** One label's worth of commands; call the builder methods in printing order, then bytes(). */
export class TsplJob {
  private parts: Uint8Array[] = []

  private cmd(text: string) {
    this.parts.push(enc.encode(text + CRLF))
    return this
  }

  /** `SIZE m mm,n mm` — label width and length. Manual: 200 dpi = 8 dots/mm. */
  size(widthMm: number, heightMm: number) {
    assertPositive('SIZE width', widthMm)
    assertPositive('SIZE height', heightMm)
    return this.cmd(`SIZE ${num(widthMm)} mm,${num(heightMm)} mm`)
  }

  /** `GAP m mm,n mm` — gap between labels (0..127 mm) and gap offset. `GAP 0 mm,0 mm` = continuous media. */
  gap(gapMm: number, offsetMm = 0) {
    assertRange('GAP', gapMm, 0, 127)
    assertRange('GAP offset', offsetMm, 0, 127)
    return this.cmd(`GAP ${num(gapMm)} mm,${num(offsetMm)} mm`)
  }

  /** `BLINE m mm,n mm` — black-mark media instead of gap. */
  bline(markMm: number, offsetMm = 0) {
    assertRange('BLINE', markMm, 0, 127)
    return this.cmd(`BLINE ${num(markMm)} mm,${num(offsetMm)} mm`)
  }

  /** `DENSITY n` — darkness 0 (lightest) .. 15 (darkest); printer default is 8. */
  density(n: number) {
    assertRange('DENSITY', n, 0, 15, true)
    return this.cmd(`DENSITY ${n}`)
  }

  /** `SPEED n` — inches per second. Valid values are model-specific (manual table); omit to keep the printer default. */
  speed(ips: number) {
    assertPositive('SPEED', ips)
    return this.cmd(`SPEED ${num(ips)}`)
  }

  /** `DIRECTION n[,m]` — n: 0/1 print direction, m: 0 normal / 1 mirror. */
  direction(n: 0 | 1, mirror: 0 | 1 = 0) {
    return this.cmd(`DIRECTION ${n},${mirror}`)
  }

  /** `REFERENCE x,y` — origin of the label in dots. */
  reference(xDots: number, yDots: number) {
    return this.cmd(`REFERENCE ${int(xDots)},${int(yDots)}`)
  }

  /** `CLS` — clear the image buffer. Must come after SIZE/GAP. */
  cls() {
    return this.cmd('CLS')
  }

  /**
   * `BITMAP X,Y,width,height,mode,data` — width in BYTES, height in dots, mode 0 OVERWRITE / 1 OR / 2 XOR.
   * `bits` is packed MSB-first, `widthBytes * heightDots` long. Bit value 1 = white (no dot), 0 = black —
   * not spelled out in the manual's prose but implied by its worked example and confirmed on hardware.
   */
  bitmap(xDots: number, yDots: number, widthBytes: number, heightDots: number, bits: Uint8Array, mode: 0 | 1 | 2 = 0) {
    assertRange('BITMAP width', widthBytes, 1, 65535, true)
    assertRange('BITMAP height', heightDots, 1, 65535, true)
    if (bits.length !== widthBytes * heightDots)
      throw new RangeError(`BITMAP data is ${bits.length} bytes, expected ${widthBytes}*${heightDots}=${widthBytes * heightDots}`)
    this.parts.push(enc.encode(`BITMAP ${int(xDots)},${int(yDots)},${widthBytes},${heightDots},${mode},`), bits, enc.encode(CRLF))
    return this
  }

  /** `PRINT m[,n]` — m label sets, n copies each (both ≥ 1). */
  print(sets = 1, copies = 1) {
    assertRange('PRINT sets', sets, 1, 999999999, true)
    assertRange('PRINT copies', copies, 1, 999999999, true)
    return this.cmd(`PRINT ${sets},${copies}`)
  }

  /** Escape hatch for commands not wrapped here; `text` without CR LF. */
  raw(text: string) {
    return this.cmd(text)
  }

  bytes(): Uint8Array<ArrayBuffer> {
    const out = new Uint8Array(new ArrayBuffer(this.parts.reduce((n, p) => n + p.length, 0)))
    let o = 0
    for (const p of this.parts) { out.set(p, o); o += p.length }
    return out
  }
}

/** `<ESC>!?` — immediate status request; printer answers with one status byte (manual §Status Polling). */
export const STATUS_REQUEST = new Uint8Array<ArrayBuffer>(new ArrayBuffer(3)).fill(0)
STATUS_REQUEST.set([0x1b, 0x21, 0x3f])

/** Decode the single status byte returned for `<ESC>!?`. */
export function parseStatus(b: number): { ok: boolean; flags: string[] } {
  const table: [number, string][] = [
    [0x01, 'head opened'], [0x02, 'paper jam'], [0x04, 'out of paper'], [0x08, 'out of ribbon'],
    [0x10, 'paused'], [0x20, 'printing'], [0x80, 'other error'],
  ]
  const flags = table.filter(([bit]) => b & bit).map(([, name]) => name)
  return { ok: b === 0x00, flags }
}

/** Convenience: whole raster label in one call. `speed` undefined = leave printer default. */
export function rasterLabel(o: {
  widthMm: number; heightMm: number; gapMm: number; density?: number; speed?: number; direction?: 0 | 1
  widthBytes: number; heightDots: number; bits: Uint8Array; copies?: number
}): Uint8Array<ArrayBuffer> {
  const job = new TsplJob().size(o.widthMm, o.heightMm).gap(o.gapMm)
  if (o.density != null) job.density(o.density)
  if (o.speed != null) job.speed(o.speed)
  job.direction(o.direction ?? 1).cls().bitmap(0, 0, o.widthBytes, o.heightDots, o.bits).print(1, o.copies ?? 1)
  return job.bytes()
}

// ---- helpers ----
const num = (n: number) => String(+n.toFixed(2))
const int = (n: number) => String(Math.round(n))
function assertPositive(what: string, n: number) {
  if (!(n > 0) || !Number.isFinite(n)) throw new RangeError(`${what} must be > 0, got ${n}`)
}
function assertRange(what: string, n: number, min: number, max: number, integer = false) {
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n)))
    throw new RangeError(`${what} must be ${integer ? 'an integer ' : ''}${min}..${max}, got ${n}`)
}
