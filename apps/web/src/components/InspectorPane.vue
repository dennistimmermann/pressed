<!--
  Wiring only: the Inspector pane (SPEC §4.3 · §4.4) lives in `@/editor`, which knows
  nothing about labels. Here is where the caret's element, the scope's props, the cascade and
  the rule commands come from — and where each event becomes one text edit on the one model.
-->
<script setup lang="ts">
import { computed } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { InspectorPane as Inspector } from '@/editor'
import type { Loc } from '@/editor/ast.ts'
import {
  addClassToElement, addProp, availableClasses, caretLine, declare, deleteRule,
  editor, element, elementComputed, elementMarkers, elementSchema, ensureSelector, goToOffset, handle,
  removeClassFromElement, renameRule, ruleAtCaret, ruleOrigin, ruleUsage, scopeProps, setSelectedText,
  styleMarkers, styleTargets, variables,
} from '@/stores/editor'
import { settings } from '@/stores/settings'

/** What the caret is in: an element, a rule (Style block), or the script block (E8). */
const kind = computed(() => (editor.activeTab.kind === 'template' ? 'element' : editor.activeTab.kind === 'style' ? 'rule' : 'script'))

/** E12: under 900px the sections are an accordion — opening one shuts the others. */
const stacked = useMediaQuery('(max-width: 900px)')
function toggle(section: 'props' | 'attributes' | 'logic' | 'style') {
  const collapsed = settings.inspectorCollapsed
  if (stacked.value && collapsed[section]) for (const k of Object.keys(collapsed) as (keyof typeof collapsed)[]) collapsed[k] = true
  collapsed[section] = !collapsed[section]
}

/**
 * Where the thing is (SPEC §4.3). Blocks has no editor pane, so there is no line to name;
 * inside a snippet the scope is the answer to "where am I".
 */
const locator = computed(() => {
  const scope = editor.activeTab.scope
  if (scope !== null) return `in ${scope}`
  return (settings.modeByTemplate[editor.templateId ?? ''] ?? 'split') === 'blocks' ? 'selection' : `line ${caretLine.value} · caret`
})
</script>

<template>
  <Inspector
    :kind="kind"
    :locator="locator"
    :element="element"
    :schema="elementSchema"
    :handle="handle"
    :source="editor.source"
    :scope-props="kind === 'element' || kind === 'script' ? scopeProps : null"
    :targets="styleTargets"
    :classes="availableClasses()"
    :variables="variables"
    :computed-style="elementComputed"
    :markers="elementMarkers"
    :style-markers="styleMarkers"
    :rule="ruleAtCaret"
    :used-by="ruleUsage"
    :rule-origin="ruleOrigin"
    :scoped="editor.activeTab.scope !== null"
    :scope-name="editor.activeTab.scope"
    root-name="label"
    :collapsed="settings.inspectorCollapsed"
    empty-hint="select an element or rule to edit it"
    @toggle="toggle"
    @add-class="addClassToElement"
    @ensure-selector="ensureSelector"
    @detach="removeClassFromElement"
    @set-text="setSelectedText"
    @add-prop="addProp"
    @declare="declare"
    @rename-rule="ruleAtCaret && renameRule(ruleAtCaret, $event)"
    @delete-rule="ruleAtCaret && deleteRule(ruleAtCaret)"
    @select="(loc: Loc) => goToOffset(loc.start)"
    @reveal="goToOffset"
  />
</template>
