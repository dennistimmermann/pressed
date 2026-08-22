import { languages } from 'monaco-editor-core'

/**
 * A small Monarch tokenizer for `.vue` — the base layer under Volar's semantic tokens.
 *
 * It only has to produce the five voices design §3.3 names (tag, attribute, expression,
 * text, comment); everything finer inside `<script>`/`<style>` is left to the semantic
 * tokens the language service sends. `<script>`/`<style>`/`<meta>` bodies get their own
 * state so a stray `a < b` in code is not mistaken for a tag.
 */
export const vueTokens: languages.IMonarchLanguage = {
  defaultToken: 'text',
  tokenPostfix: '.vue',

  tokenizer: {
    root: [
      [/<!--/, 'comment', '@comment'],
      // Blocks whose body is not markup: skip to the matching close tag.
      [/(<)(script|style|meta)/, ['delimiter', { token: 'tag', next: '@blockTag.$2' }]],
      [/(<)(\/?)([\w.-]+)/, ['delimiter', 'delimiter', { token: 'tag', next: '@tag' }]],
      [/\{\{/, { token: 'expression', next: '@interpolation' }],
      [/[^<{]+/, 'text'],
      [/./, 'text'],
    ],

    comment: [
      [/-->/, 'comment', '@pop'],
      [/[^-]+/, 'comment'],
      [/./, 'comment'],
    ],

    // Attributes. A `:`/`@`/`v-` prefix means the value is an expression, not a string.
    tag: [
      [/\s+/, ''],
      [
        /[:@#][\w.-]+|v-[\w.:-]+|[\w.-]+/,
        { cases: { '^[:@#]|^v-': { token: 'attribute.name', next: '@bound' }, '@default': 'attribute.name' } },
      ],
      [/=/, 'delimiter'],
      [/"/, 'attribute.value', '@string."'],
      [/'/, 'attribute.value', "@string.'"],
      [/\/?>/, 'delimiter', '@pop'],
    ],

    bound: [
      [/=/, 'delimiter'],
      [/"/, 'expression', '@expression."'],
      [/'/, 'expression', "@expression.'"],
      [/./, { token: '@rematch', next: '@pop' }],
    ],

    string: [
      [/[^"']+/, 'attribute.value'],
      [/["']/, { cases: { '$#==$S2': { token: 'attribute.value', next: '@pop' }, '@default': 'attribute.value' } }],
    ],

    expression: [
      [/[^"']+/, 'expression'],
      [/["']/, { cases: { '$#==$S2': { token: 'expression', next: '@pop' }, '@default': 'expression' } }],
    ],

    interpolation: [
      [/\}\}/, 'expression', '@pop'],
      [/[^}]+/, 'expression'],
      [/./, 'expression'],
    ],

    // `$S2` carries the tag name through, so `</style>` does not close a `<script>`.
    blockTag: [
      [/[^>]+/, 'attribute.name'],
      [/>/, { token: 'delimiter', next: '@blockBody.$S2' }],
    ],
    blockBody: [
      [/(<\/)([\w-]+)(>)/, { cases: { '$2==$S2': ['delimiter', { token: 'tag', next: '@popall' }, 'delimiter'], '@default': 'text' } }],
      [/[^<]+/, 'text'],
      [/./, 'text'],
    ],
  },
}

export const vueLanguageConfig: languages.LanguageConfiguration = {
  comments: { blockComment: ['<!--', '-->'] },
  brackets: [
    ['<!--', '-->'],
    ['{', '}'],
    ['[', ']'],
    ['(', ')'],
  ],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: "'", close: "'" },
    { open: '"', close: '"' },
    { open: '<!--', close: '-->' },
  ],
  surroundingPairs: [
    { open: "'", close: "'" },
    { open: '"', close: '"' },
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '<', close: '>' },
  ],
  indentationRules: {
    increaseIndentPattern: /<(?!\?|(?:area|base|br|col|hr|img|input|link|meta|source)\b|[^>]*\/>)([-\w.]+)(?=\s|>)\b[^>]*>(?!.*<\/\1>)|\{[^}"']*$/,
    decreaseIndentPattern: /^\s*(<\/[-\w.]+\b[^>]*>|-->|\})/,
  },
  // Enter between `<div>` and `</div>` (or `{` and `}`) opens an indented line and pushes the
  // closer down — the HTML/brace behaviour people expect from any editor.
  onEnterRules: [
    {
      beforeText: /<(?!(?:area|base|br|col|hr|img|input|link|meta|source)\b)([-\w.:]+)[^/>]*>\s*$/i,
      afterText: /^\s*<\/([-\w.:]+)\s*>/i,
      action: { indentAction: languages.IndentAction.IndentOutdent },
    },
    {
      beforeText: /<(?!(?:area|base|br|col|hr|img|input|link|meta|source)\b)([-\w.:]+)[^/>]*>\s*$/i,
      action: { indentAction: languages.IndentAction.Indent },
    },
    { beforeText: /\{\s*$/, afterText: /^\s*\}/, action: { indentAction: languages.IndentAction.IndentOutdent } },
    { beforeText: /\{\s*$/, action: { indentAction: languages.IndentAction.Indent } },
  ],
}
