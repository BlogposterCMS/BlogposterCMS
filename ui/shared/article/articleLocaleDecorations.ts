import { Extension, type JSONContent } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/** ProseMirror decorations are editor-only and never become saved HTML attributes. */
export function articleLocaleDecorations(isFallback: (node: JSONContent) => boolean, languageButton?: (blockId: string) => HTMLElement) {
  return Extension.create({ name: 'sourceLanguageFeedback', addProseMirrorPlugins() {
    return [new Plugin({ props: { decorations(state) {
      const decorations: Decoration[] = [];
      state.doc.forEach((node, position) => {
        if (isFallback(node.toJSON())) decorations.push(Decoration.node(position, position + node.nodeSize, { class: 'article-editor__source-language' }));
        if (languageButton && isFallback(node.toJSON()) && state.selection.from >= position && state.selection.from < position + node.nodeSize) {
          decorations.push(Decoration.widget(position + (node.isTextblock ? 1 : 0), () => languageButton(String(node.attrs['block-id'] || '')), { key: `language-${node.attrs['block-id'] || position}`, side: -1, stopEvent: () => true }));
        }
      });
      return DecorationSet.create(state.doc, decorations);
    } } })];
  } });
}
