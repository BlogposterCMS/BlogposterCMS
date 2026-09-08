/** @jest-environment jsdom */
import { storeEditableWidgetContent } from '../ui/designer/app/renderer/eventHandlers';
test('native text edits retain the module stylesheet instead of becoming an inline widget', () => {
  const widget = document.createElement('div');
  widget.dataset.instanceId = 'heading'; widget.dataset.widgetId = 'textBox';
  const editable = document.createElement('div'); editable.className = 'editable widget-rich-text';
  editable.dataset.textEditable = ''; editable.innerHTML = '<h1 style="font-size:48px">Updated</h1>';
  const code: any = { heading: { meta: { workareaId: 'intro', settings: { alignment: 'center' } } } };
  storeEditableWidgetContent(widget, code, editable, editable.outerHTML);
  expect(code.heading.html).toBeNull();
  expect(code.heading.meta.html).toBe('<h1 style="font-size:48px">Updated</h1>');
  expect(code.heading.meta.settings.alignment).toBe('center');
  expect(code.heading.meta.workareaId).toBe('intro');
});
test('imported text preserves its authored inline rendering contract', () => {
  const widget = document.createElement('div'); widget.dataset.instanceId = 'import'; widget.dataset.widgetId = 'textBox';
  const editable = document.createElement('div'); editable.className = 'editable';
  const code: any = { import: { css: '.import{color:red}', meta: { htmlImport: { version: 1 } } } };
  storeEditableWidgetContent(widget, code, editable, '<h1>Import</h1>');
  expect(code.import.html).toBe('<h1>Import</h1>'); expect(code.import.css).toBe('.import{color:red}');
});


test('editing translated native text preserves other locales and base copy', () => {
  const widget = document.createElement('div');
  widget.dataset.instanceId='title'; widget.dataset.widgetId='textBox';
  const editable=document.createElement('div'); editable.className='widget-rich-text';
  editable.dataset.textEditable=''; editable.dataset.contentLocale='zh'; editable.innerHTML='<p>Updated Chinese copy</p>';
  const code:any={title:{meta:{html:'Base',translations:{en:{html:'English'},zh:{html:'Previous'}}}}};
  storeEditableWidgetContent(widget,code,editable,editable.outerHTML);
  expect(code.title.meta.html).toBe('Base');
  expect(code.title.meta.translations.en.html).toBe('English');
  expect(code.title.meta.translations.zh.html).toBe('<p>Updated Chinese copy</p>');
  expect(code.title.html).toBeNull();
});
