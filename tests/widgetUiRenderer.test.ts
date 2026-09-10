/** @jest-environment jsdom */
import { createWidgetUi } from '../ui/shared/widget-ui/renderer';
import { localUiMedia } from '../ui/shared/widget-ui/controls';
import type { UiNode } from '../ui/shared/widget-ui/model';

test('a delayed worker render cannot overwrite a newer local edit', () => {
  const host = document.createElement('div'); document.body.append(host);
  const dispatch = jest.fn(); const ui = createWidgetUi(host, { dispatch });
  const tree = (value: string, inputRevision: number): UiNode => ({ tag: 'composer', key: 'question', value, props: { inputRevision }, events: { input: 'edit' } });
  ui.render(tree('', 0)); const editor = ui.root.querySelector<HTMLElement>('[contenteditable]')!;
  editor.textContent = 'a'; editor.dispatchEvent(new InputEvent('input'));
  editor.textContent = 'ab'; editor.dispatchEvent(new InputEvent('input'));
  ui.render(tree('a', 1)); expect(editor.textContent).toBe('ab');
  ui.render(tree('', 2)); expect(editor.textContent).toBe('');
  expect(dispatch.mock.calls[1][0].inputRevision).toBe(2);
  ui.dispose(); host.remove();
});

test('existing UI-kit inputs forward composed values through the isolated action channel', () => {
  const host = document.createElement('div'); document.body.append(host);
  const dispatch = jest.fn(); const ui = createWidgetUi(host, { dispatch });
  ui.render({ tag: 'kit', key: 'search', events: { input: 'query' }, props: {
    component: { id: 'search', name: 'Search', type: 'input', props: { label: 'Search' } }
  } });
  const kit = ui.root.querySelector('bp-kit-component') || ui.root.querySelector('[data-ui-key="search"]')!.firstElementChild!;
  const input = kit.shadowRoot!.querySelector('input')!;
  input.value = '中文';
  input.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ action: 'query', value: '中文' }));
  ui.dispose(); host.remove();
});

test('composer keeps its DOM, cursor and unfinished Chinese composition across updates', () => {
  const host = document.createElement('div'); document.body.append(host);
  const dispatch = jest.fn(); const ui = createWidgetUi(host, {dispatch});
  const tree: UiNode = {tag:'div',children:[{tag:'composer',key:'question',value:'',events:{input:'type',submit:'send'}}]};
  ui.render(tree); const editor = ui.root.querySelector('[contenteditable]')!;
  editor.dispatchEvent(new CompositionEvent('compositionstart')); editor.textContent = '中文';
  ui.render(tree); expect(ui.root.querySelector('[contenteditable]')).toBe(editor); expect(editor.textContent).toBe('中文');
  editor.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); expect(dispatch).not.toHaveBeenCalled();
  editor.dispatchEvent(new CompositionEvent('compositionend')); expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({action:'type',value:'中文'}));
  ui.dispose(); host.remove();
});

test('public styles stay in their own root and cannot change admin tokens', () => {
  document.documentElement.style.setProperty('--bp-color-default-1','#112233');
  const before = document.documentElement.getAttribute('style');
  const first = document.createElement('div'), second = document.createElement('div'); document.body.append(first,second);
  const a = createWidgetUi(first), b = createWidgetUi(second);
  a.render({tag:'div',styles:{'--bp-color-default-1':'#ff0000'},children:[{tag:'button',text:'Public'}]});
  b.render({tag:'button',text:'Other'});
  expect(document.documentElement.getAttribute('style')).toBe(before);
  expect(second.shadowRoot!.innerHTML).not.toContain('#ff0000');
  expect(() => a.render({tag:'div',styles:{background:'url(https://example.com/leak)'}})).toThrow('UI_KIT_COMPONENT_STYLE_VALUE');
  a.dispose();b.dispose();first.remove();second.remove();
});

test('automatic media stays local while article scripts, styles and embedded forms are removed', () => {
  expect(localUiMedia('https://example.com/leak')).toBeNull();
  expect(localUiMedia('/api/admin')).toBeNull(); expect(localUiMedia('/media/picture.png?secret=value')).toBeNull();
  const host = document.createElement('div'); const ui = createWidgetUi(host);
  ui.render({tag:'richtext',props:{html:'<h2>Article</h2><script>alert(1)</script><style>body{color:red}</style><form><input></form><p onclick="evil()">Safe</p>'}});
  expect(ui.root.querySelector('[data-ui-richtext]')!.textContent).toContain('Article');
  expect(ui.root.querySelector('[data-ui-richtext]')!.querySelector('script,style,form,input,[onclick]')).toBeNull(); ui.dispose();
});

test('article fragment links are disabled after presentation IDs are stripped', () => {
  const host = document.createElement('div'); const ui = createWidgetUi(host);
  ui.render({ tag: 'richtext', props: { html: '<aside>Page navigation</aside><h2 id="answer">Answer</h2><a href="#answer">Jump</a><a href="/guide">Guide</a>' } });
  const article = ui.root.querySelector('[data-ui-richtext]')!;
  expect(article.querySelector('aside')).toBeNull();
  expect(article.querySelector('h2')!.hasAttribute('id')).toBe(false);
  expect(article.querySelector('a')!.hasAttribute('href')).toBe(false);
  expect(article.querySelectorAll('a')[1].getAttribute('href')).toBe('/guide');
  ui.dispose();
});
