/**
 * The seam between the text editor (WP1: Monaco + Volar) and everything that edits text
 * without being the editor (WP2: property editor, component/variable insertion).
 *
 * Deliberately tiny and Monaco-free: offsets, not positions; one `executeEdits` so a batch
 * is a single undo step, shared with the editor's own undo stack.
 */
export interface EditorHandle {
  getValue(): string
  /** Caret position as a character offset into `getValue()`. */
  getOffset(): number
  /** Move the caret, optionally selecting up to `endOffset`. */
  setCaret(offset: number, endOffset?: number): void
  /** The current selection as offsets; `start === end` when there is only a caret. */
  getSelection(): { start: number; end: number }
  /** Scroll `offset` into view (centred when it is off screen) without moving the caret. */
  revealOffset(offset: number): void
  /** Format a range (offsets) with the language service; whole document when omitted. */
  format(range?: { start: number; end: number }): Promise<void>
  /** Apply text-range edits as one undoable operation. Ranges are offsets into the current value. */
  executeEdits(edits: { start: number; end: number; text: string }[]): void
  /** Subscribe to caret moves; returns an unsubscribe function. */
  onCaretChange(cb: (offset: number) => void): () => void
  focus(): void
}
