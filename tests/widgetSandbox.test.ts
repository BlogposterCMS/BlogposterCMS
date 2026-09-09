/** @jest-environment jsdom */
import { buildWidgetView, sandboxDocument } from '../ui/widgets/rendering/widgetSandbox';

test('UI bridge builds inert controls with existing classes', () => {
  const view = buildWidgetView({tag:'div',children:[{tag:'button',text:'Load',action:'load'},{tag:'input',name:'query',type:'text'}]});
  expect(view.querySelector('button')?.type).toBe('button');
  expect(view.querySelector('button')?.dataset.widgetAction).toBe('load');
  expect(view.querySelector('button')?.className).toBe('button secondary sm');
  expect(view.querySelector('input')?.className).toBe('');
});

test.each(['script','iframe','img','a','form','style','object','link','svg','video'])('UI bridge rejects active or network-bearing %s nodes', tag => {
  expect(() => buildWidgetView({tag})).toThrow('WIDGET_VIEW_INVALID');
});

test('UI bridge ignores executable attributes and bounds content', () => {
  const element = buildWidgetView({tag:'div',text:'<img src=/leak>',style:'background:url(/leak)',onclick:'alert(1)'} as any);
  expect(element.childElementCount).toBe(0);
  expect(element.attributes.length).toBe(0);
  expect(() => buildWidgetView({tag:'p',text:'x'.repeat(16385)})).toThrow('WIDGET_VIEW_TEXT_LIMIT');
  expect(() => buildWidgetView({tag:'div',children:Array.from({length:501},()=>({tag:'span'}))})).toThrow('WIDGET_VIEW_INVALID');
});

test('UI bridge restores select values after building the options', () => {
  const select = buildWidgetView({tag:'select',value:'second',children:[{tag:'option',value:'first',text:'First'},{tag:'option',value:'second',text:'Second'}]}) as HTMLSelectElement;
  expect(select.value).toBe('second');
});

test('isolated bridge denies network and uses a worker without DOM access', () => {
  const html = sandboxDocument('testNonce');
  expect(html).toContain("connect-src 'none'");
  expect(html).toContain("frame-src 'none'");
  expect(html).toContain('new Worker(url)');
  expect(html).not.toContain('allow-same-origin');
});
