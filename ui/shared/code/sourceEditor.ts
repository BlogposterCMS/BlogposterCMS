import { defaultKeymap, history, historyKeymap, isolateHistory } from '@codemirror/commands';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { bracketMatching, defaultHighlightStyle, foldGutter, foldKeymap, HighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language';
import { openSearchPanel, searchKeymap } from '@codemirror/search';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';

export type SourceEditorLanguage = 'html' | 'css';
export type SourceEditorOptions = { parent: HTMLElement; value: string; language: SourceEditorLanguage; label: string; onChange: (value: string) => void };
export type SourceEditor = {
  element: HTMLElement;
  getValue: () => string;
  setValue: (value: string) => void;
  focus: () => void;
  setReadOnly: (readOnly: boolean) => void;
  setWrap: (wrap: boolean) => void;
  search: () => void;
  format: () => Promise<void>;
  destroy: () => void;
};

export const SOURCE_EDITOR_MAX_FORMAT_LENGTH = 1_000_000;

export class SourceEditorError extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(`${code}: ${message}`); this.name = 'SourceEditorError'; this.code = code; }
}

function lineSeparatorFor(value: string): '\r\n' | '\n' | undefined {
  const at = value.search(/\r\n?|\n/);
  return at < 0 ? undefined : value.startsWith('\r\n', at) ? '\r\n' : '\n';
}

function supportFor(language: SourceEditorLanguage): Extension { return language === 'html' ? html() : css(); }

function theme(): Extension {
  return EditorView.theme({
    '&.bp-source-editor': { display: 'flex', height: '100%', maxHeight: '100%', minHeight: '0', color: 'var(--studio-text, #1f2933)', backgroundColor: 'var(--studio-surface-solid, #ffffff)' },
    '.cm-scroller': { flex: '1 1 auto', minHeight: '0', overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', lineHeight: '1.55' },
    // Keep editor colors ahead of broad form/contenteditable rules in the host application.
    '&.bp-source-editor .cm-content, &.bp-source-editor .cm-content[contenteditable="true"]': { minHeight: '100%', padding: '12px 0', color: 'var(--studio-text, #1f2933)', caretColor: 'var(--color-primary, #3b72f6)', fontFamily: 'inherit', fontSize: '13px' },
    '.cm-gutters': { flex: '0 0 auto', color: 'var(--studio-text-muted, #687180)', backgroundColor: 'var(--studio-surface-muted, #f4f6f8)', borderRight: '1px solid var(--studio-border, #e3e7ec)' },
    '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--studio-surface-muted, #eef3f8)' },
    '&.cm-focused .cm-selectionBackground, ::selection': { backgroundColor: 'color-mix(in srgb, var(--color-primary, #3b72f6) 20%, transparent)' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--color-primary, #3b72f6)' },
  });
}

// Blend syntax colors with the existing theme text so light/dark changes need no second theme owner.
const highlightStyle = HighlightStyle.define(defaultHighlightStyle.specs.map(spec => ({
  ...spec, ...(spec.color ? { color: `color-mix(in srgb, ${spec.color} 45%, var(--studio-text, #1f2933))` } : {}),
})));

function formatError(language: SourceEditorLanguage): SourceEditorError {
  return new SourceEditorError(language === 'html' ? 'SOURCE_EDITOR_INVALID_HTML' : 'SOURCE_EDITOR_INVALID_CSS', language === 'html' ? 'The HTML source could not be formatted.' : 'The CSS source could not be formatted.');
}

async function formatWithPrettier(source: string, language: SourceEditorLanguage, endOfLine: 'lf' | 'crlf'): Promise<string> {
  // Literal imports let the local production bundle include both lazy formatter plugins.
  const [prettierModule, pluginModule] = await Promise.all([import('prettier/standalone'), language === 'html' ? import('prettier/plugins/html') : import('prettier/plugins/postcss')]);
  const prettier = prettierModule.default ?? prettierModule;
  const plugin = pluginModule.default ?? pluginModule;
  return prettier.format(source, { parser: language, plugins: [plugin], endOfLine, htmlWhitespaceSensitivity: 'strict', embeddedLanguageFormatting: 'off' });
}

export function createSourceEditor(options: SourceEditorOptions): SourceEditor {
  if (!options.parent || typeof options.parent.appendChild !== 'function') throw new SourceEditorError('SOURCE_EDITOR_INVALID_PARENT', 'A valid source editor parent is required.');
  if (!['html', 'css'].includes(options.language)) throw new SourceEditorError('SOURCE_EDITOR_INVALID_LANGUAGE', 'The source editor language is unsupported.');
  if (typeof options.value !== 'string' || typeof options.onChange !== 'function') throw new SourceEditorError('SOURCE_EDITOR_INVALID_OPTIONS', 'Source editor value and change callback are required.');

  const wrapCompartment = new Compartment();
  const readOnlyCompartment = new Compartment();
  const initialSeparator = lineSeparatorFor(options.value);
  let preferredSeparator = initialSeparator ?? '\n';
  let readOnly = false;
  let wrapped = false;
  let destroyed = false;
  let formatSequence = 0;
  let documentVersion = 0;
  let view!: EditorView;
  const value = () => view.state.doc.toString().replace(/\r\n?|\n/g, preferredSeparator);
  const usable = () => { if (destroyed) throw new SourceEditorError('SOURCE_EDITOR_DESTROYED', 'The source editor has been destroyed.'); };

  const state = EditorState.create({
    doc: options.value,
    extensions: [
      ...(initialSeparator ? [EditorState.lineSeparator.of(initialSeparator)] : []),
      supportFor(options.language), lineNumbers(), foldGutter(), indentOnInput(), bracketMatching(),
      syntaxHighlighting(highlightStyle), history(),
      keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap, ...searchKeymap]),
      wrapCompartment.of([]), readOnlyCompartment.of([EditorState.readOnly.of(false), EditorView.editable.of(true)]), theme(),
      // Register attributes through CodeMirror so reconfiguration cannot remove them.
      EditorView.editorAttributes.of({ class: 'bp-source-editor', 'data-source-editor-language': options.language }),
      EditorView.contentAttributes.of({ 'aria-label': options.label || 'Source editor' }),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        documentVersion += 1;
        options.onChange(value());
      }),
    ],
  });
  view = new EditorView({ state, parent: options.parent });

  return {
    element: view.dom,
    getValue: () => { usable(); return value(); },
    setValue: (nextValue) => {
      usable();
      if (typeof nextValue !== 'string') throw new SourceEditorError('SOURCE_EDITOR_INVALID_VALUE', 'Source editor value must be text.');
      preferredSeparator = lineSeparatorFor(nextValue) ?? preferredSeparator;
      if (value() !== nextValue) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: nextValue }, userEvent: 'input.setValue' });
    },
    focus: () => { usable(); view.focus(); },
    setReadOnly: (nextReadOnly) => {
      usable();
      const next = Boolean(nextReadOnly);
      if (next === readOnly) return;
      readOnly = next;
      view.dispatch({ effects: readOnlyCompartment.reconfigure([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]) });
    },
    setWrap: (nextWrap) => {
      usable();
      const next = Boolean(nextWrap);
      if (next === wrapped) return;
      wrapped = next;
      view.dispatch({ effects: wrapCompartment.reconfigure(next ? EditorView.lineWrapping : []) });
    },
    search: () => { usable(); openSearchPanel(view); },
    format: async () => {
      usable();
      if (readOnly) throw new SourceEditorError('SOURCE_EDITOR_READ_ONLY', 'Read-only source cannot be formatted.');
      const sequence = ++formatSequence;
      const before = value();
      const version = documentVersion;
      if (before.length > SOURCE_EDITOR_MAX_FORMAT_LENGTH) throw new SourceEditorError('SOURCE_EDITOR_TOO_LARGE', 'Source is too large to format safely.');
      let formatted: string;
      try { formatted = await formatWithPrettier(before, options.language, preferredSeparator === '\r\n' ? 'crlf' : 'lf'); } catch { throw formatError(options.language); }
      usable();
      if (readOnly) throw new SourceEditorError('SOURCE_EDITOR_READ_ONLY', 'Read-only source cannot be formatted.');
      if (sequence !== formatSequence || version !== documentVersion || value() !== before) throw new SourceEditorError('SOURCE_EDITOR_FORMAT_STALE', 'Source changed while formatting was in progress.');
      // Formatting must undo independently of the user's immediately preceding edits.
      if (formatted !== before) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: formatted }, userEvent: 'input.format', annotations: isolateHistory.of('full') });
    },
    destroy: () => { if (destroyed) return; destroyed = true; formatSequence += 1; view.destroy(); },
  };
}
