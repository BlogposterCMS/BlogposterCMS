/** @jest-environment jsdom */
import { Editor } from '@tiptap/core';
import { articleExtensions } from '../ui/shared/article/articleSchema';
import { articleCommandAvailable, mountArticleToolbarState } from '../ui/shared/article/articleToolbarState';

test('toolbar follows schema, selection and history without changing the document', () => {
  const editor = new Editor({ extensions: articleExtensions(), content: '<p>Read the guide</p>' });
  const toolbar = document.createElement('div');
  for (const label of ['Undo', 'Redo', 'Bold', 'Edit link', 'Media description']) { const button = document.createElement('button'); button.setAttribute('aria-label', label); toolbar.append(button); }
  let busy = false;
  const controls = mountArticleToolbarState(editor, toolbar, () => busy);
  const available = (label: string) => !toolbar.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.disabled;
  expect(available('Undo')).toBe(false); expect(available('Redo')).toBe(false);
  expect(available('Bold')).toBe(true); expect(available('Edit link')).toBe(false); expect(available('Media description')).toBe(false);
  editor.commands.setTextSelection({ from: 1, to: 5 });
  expect(available('Edit link')).toBe(true);
  editor.commands.toggleBold(); expect(available('Undo')).toBe(true);
  editor.commands.undo(); expect(available('Redo')).toBe(true);
  editor.commands.setContent('<pre><code>code</code></pre>'); editor.commands.setTextSelection(2);
  expect(available('Bold')).toBe(false);
  editor.commands.setContent('<p></p><img src="/media/example.png">'); editor.commands.setNodeSelection(2);
  expect(available('Media description')).toBe(true);
  const before = editor.getHTML();
  busy = true; controls.refresh(); expect(available('Media description')).toBe(false);
  expect(articleCommandAvailable(editor, 'unknown action')).toBe(false);
  expect(editor.getHTML()).toBe(before); editor.destroy();
});
