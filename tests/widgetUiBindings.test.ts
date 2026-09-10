/** @jest-environment jsdom */
import { createUiBindings } from '../ui/shared/widget-ui/bindings';
import { normalizeUiDocument, readBinding } from '../ui/shared/widget-ui/model';
import { searchPopoverDocument } from '../ui/shared/widget-ui/presets';

test('event binds input to a named request and opens conditional results', async () => {
  const doc = searchPopoverDocument(); doc.sources!.articles!.debounceMs = 0;
  const request = jest.fn(async () => ({items:[{id:'one', title:'An article', path:'/article'}]}));
  let latest: any;
  const binding = createUiBindings(doc, request, tree => { latest = tree; });
  await binding.dispatch({action:'search', value:'scanner'});
  await Promise.resolve();
  expect(request).toHaveBeenCalledWith('publicSearch', {query:{q:'scanner',lang:'en',type:'page',limit:'10'}}, expect.any(AbortSignal));
  expect(binding.snapshot().data.articles.status).toBe('ready');
  expect(JSON.stringify(latest)).toContain('An article');
  await binding.dispatch({action:'close'});
  expect(latest.children[2].open).toBe(false); binding.dispose();
});

test('late results and failures cannot replace a newer successful search', async () => {
  const doc = searchPopoverDocument(); doc.sources!.articles!.debounceMs = 0;
  let first!: (value: unknown) => void;
  const request = jest.fn().mockImplementationOnce(() => new Promise(resolve => { first = resolve; }))
    .mockResolvedValueOnce({items:[{id:'new',title:'New'}]});
  const binding = createUiBindings(doc, request, () => {});
  await binding.dispatch({action:'search',value:'old'});
  await binding.dispatch({action:'search',value:'new'}); await Promise.resolve();
  first({items:[{id:'old',title:'Old'}]}); await Promise.resolve();
  expect(binding.snapshot().data.articles.result.items[0].id).toBe('new'); binding.dispose();
});

test('Designer preview resolves samples without invoking a module or provider', async () => {
  const doc = searchPopoverDocument(); doc.sources!.articles!.debounceMs = 0;
  const request = jest.fn(); const binding = createUiBindings(doc, request, () => {}, true);
  await binding.dispatch({action:'search',value:'example'}); await Promise.resolve();
  expect(request).not.toHaveBeenCalled(); expect(binding.snapshot().data.articles.result.items).toHaveLength(2); binding.dispose();
});

test('bindings and actions cannot access prototype paths or evaluate code', () => {
  expect(() => readBinding({}, 'state.constructor.prototype')).toThrow('WIDGET_BINDING_PATH_INVALID');
  expect(() => readBinding({}, 'state.query()')).toThrow('WIDGET_BINDING_PATH_INVALID');
  const doc = searchPopoverDocument(); doc.actions!.bad = [{type:'request',target:'missing'}];
  expect(() => normalizeUiDocument(doc)).toThrow('WIDGET_SOURCE_MISSING');
});
