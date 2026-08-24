/**
 * The editor store, split by responsibility (CODE_REVIEW ARC-01). `@/stores/editor` resolves
 * here, so consumers are untouched. Deliberately not `export *`: `applyEdits` (the one undo
 * funnel), `markerTick`, `scopeTemplate` and `render` are the store's internals — command
 * modules import them from their siblings, views never do.
 *
 * Module graph (acyclic, state is the leaf):
 *   state ← {render, navigation, style} ← structure ← {inspector, canvas};  session ← render
 */
export { activeBlock, dirty, editor, element, elementSchema, filename, handle, meta, tabs } from './state'
export { errorCount, previewDocument, previewState, warningCount } from './render'
export {
  addBlock, badges, caretLine, enterScope, formatBlock, goToOffset, jumpTo, leaveScope,
  offsetOf, switchTab, visible,
} from './navigation'
export {
  addClassToElement, availableClasses, deleteRule, ensureSelector, removeClassFromElement,
  renameRule, ruleAtCaret, ruleOrigin, styleMarkers, styleTargets,
} from './style'
export {
  can, canFor, deleteSelected, deleteSnippet, duplicateSelected, erroredElements, indentSelected,
  insertText, insertables, layerCount, layers, moveSelected, outdentSelected, promoteSnippet,
  renameSnippet, reparent, runOnElement, scopeRules, scriptInfo, selectElement, setSelectedText,
  wrapChoices,
} from './structure'
export { addProp, elementMarkers, matchedLocs, ruleUsage, scopeProps, variables } from './inspector'
export {
  canvasEnterScope, canvasReorder, canvasResize, canvasSelect, classTarget, declare,
  elementComputed, scopeRange, setComputedStyles, writeMeta,
} from './canvas'
export {
  confirmDiscard, confirmSaveAs, deleteTemplate, initEditor, load, pendingId, renameTemplate,
  requestLoad, save, saveAs, saveAsName,
} from './session'
