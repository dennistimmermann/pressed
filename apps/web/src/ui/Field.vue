<!--
  The 25px filled control (DESIGN "Field anatomy"): an optional 12×12 icon, the value, an
  optional `×` and an optional unit chip, on `--field` with no border until focus.

  Bare, it is a number field that commits what parses. Callers that bring their own controls —
  a select, a colour swatch, a group marker — pass them as the default slot and keep the chrome;
  the root is then a `div`, because a `<label>` would forward every click to the first of them.
-->
<script setup lang="ts">
defineProps<{
  /** The inside of a 12×12 `viewBox` — module constants, never user text. */
  icon?: string
  /** Unit chip: text here, or a `<select>` through the `unit` slot. Omit for no chip. */
  unit?: string
  /** The chip has nothing to say about this value (a keyword, a driven twin): greyed. */
  unitOff?: boolean
  /** Show the `×` that clears the value — on hover or focus only. */
  unset?: boolean
  /** Read-only stand-in for the input: a binding, in accent. */
  text?: string
}>()
const emit = defineEmits<{ unset: [] }>()
const model = defineModel<number>({ default: 0 })

// Commit only what parses; a half-typed field keeps the last good number in the model, and
// leaving it puts the model's value back on screen.
const onInput = (e: Event) => {
  const n = Number((e.target as HTMLInputElement).value)
  if (Number.isFinite(n)) model.value = Math.max(0, n)
}
const onBlur = (e: Event) => { (e.target as HTMLInputElement).value = String(model.value) }
</script>

<template>
  <component :is="$slots.default ? 'div' : 'label'" class="ctl">
    <svg v-if="icon" class="ico" viewBox="0 0 12 12" aria-hidden="true" v-html="icon" />
    <slot>
      <span v-if="text" class="txt">{{ text }}</span>
      <input v-else class="v" type="text" inputmode="numeric" :value="model" @input="onInput" @blur="onBlur">
    </slot>
    <!-- Nothing to remove while the value only comes from elsewhere, so the host says when. -->
    <button v-if="unset" type="button" class="x" title="unset" @click="emit('unset')">×</button>
    <span v-if="unit != null || $slots.unit" class="u" :class="{ off: unitOff }">
      <slot name="unit">{{ unit }}</slot>
    </span>
  </component>
</template>

<style scoped>
/* Filled, borderless, 25px — focus swaps the border to --primary and the fill to --pane (§3). */
.ctl {
  position: relative;
  display: flex; align-items: center; height: 25px; min-width: 0; padding: 0 0 0 7px;
  border: 1px solid transparent; border-radius: var(--radius-control); background-color: var(--field);
  font-family: var(--font-mono); font-size: 10.5px; color: var(--foreground);
  transition: background-color 120ms ease-out, border-color 120ms ease-out;
}
.ctl:focus-within { border-color: var(--primary); background-color: var(--pane); outline: none; }
.ctl:has(.ico) { padding-left: 5px; }
/* Which dimension this field is: the box with that edge (or corner) picked out, never a letter. */
.ico {
  flex: none; width: 12px; height: 12px; margin-right: 3px;
  color: var(--faint-foreground); stroke: currentColor; fill: none;
  stroke-width: 1; stroke-linecap: round; stroke-linejoin: round;
}
/* Callers that slot their own control style it themselves — this is the bare field's. */
.v {
  flex: 1; min-width: 0; height: 100%; border: 0; background: transparent; padding: 0; outline: none;
  font: inherit; color: inherit;
}
.txt { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--accent-link); }
/* Unset ×: on hover or focus, left of the unit chip (and last in a field that has no chip). */
.x {
  flex: none; display: none; width: 14px; height: 14px; align-items: center; justify-content: center;
  margin-right: 3px; padding: 0; border: 0; border-radius: 3px; background: transparent;
  font-family: var(--font-mono); font-size: 10px; line-height: 1; color: var(--meta-foreground);
  transition: background-color 120ms ease-out, color 120ms ease-out;
}
.ctl:hover .x, .ctl:focus-within .x { display: flex; }
.x:hover { background: var(--field-border); color: var(--foreground); }
/* The unit chip: a select wearing the chip, so it stays one keyboard stop. */
.u {
  flex: none; display: flex; align-items: center; height: 19px; margin: 0 3px 0 4px; padding: 0 5px;
  border-radius: var(--radius-badge); background: var(--field-border);
  font-family: var(--font-mono); font-size: 8.5px; color: var(--muted-foreground);
}
.x + .u { margin-left: 0; }
.u:has(select)::after { content: "▾"; margin-left: 2px; font-size: 6px; color: var(--meta-foreground); }
.u.off { opacity: 0.45; }
/* The select comes in through the slot, so it is styled `:slotted` — it wears the chip, and
   the chip draws the chevron above, so the native arrow goes. */
.u :slotted(select) {
  appearance: none; border: 0; background: transparent; padding: 0; outline: none;
  font: inherit; color: inherit;
}
</style>
