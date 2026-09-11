/** @jest-environment jsdom */
import { describeLayoutTree } from '../ui/shared/layout/layoutTreePresentation';
import { renderLayoutTree } from '../ui/shared/layout/layoutDom';

test('legacy orientation defaults and authored ratios are projected without rewriting the saved document', () => {
  const legacy = { type: 'split', orientation: 'vertical', sizes: [1, 3], children: [
    { type: 'leaf', nodeId: 'sidebar', workarea: true }, { type: 'leaf', nodeId: 'content', isDynamicHost: true }
  ] };
  const before = JSON.stringify(legacy);
  const result = describeLayoutTree(legacy)!;
  expect(result.style['flex-direction']).toBe('row');
  expect(result.children.map(child => child.style.flex)).toEqual(['1 1 0', '3 1 0']);
  expect(result.children[0].attributes['data-dynamic-host']).toBeUndefined();
  expect(result.children[0].attributes['data-layout-mode']).toBe('free');
  expect(JSON.stringify(legacy)).toBe(before);
});

test('ordered style-source chains inherit the projected settings while keeping each position and media reference', () => {
  const result = describeLayoutTree({ type: 'split', children: [
    { type: 'leaf', nodeId: 'a', settings: { mode: 'grid', padding: '16px', columns: 2 }, placement: { w: 300 } },
    { type: 'leaf', nodeId: 'b', styleSource: { sourceId: 'a' }, placement: { x: 10 } },
    { type: 'leaf', nodeId: 'c', styleSource: { sourceId: 'b' }, placement: { x: 20 }, section: { id: 'c', backgroundImageId: 'asset-original', backgroundImageUrl: '/media/original.png' } }
  ] })!;
  const target = result.children[2];
  expect(target.style.padding).toBe('16px');
  expect(target.attributes['data-layout-mode']).toBe('grid');
  expect(target.attributes['gs-w']).toBe('300');
  expect(target.attributes['data-x']).toBe('20');
  expect(target.attributes['data-bg-image-id']).toBe('asset-original');
  expect(target.style['background-image']).toBe('url("/media/original.png")');
});

test('adoption keeps container and article identities and rejects a mismatched structure', () => {
  const tree: any = { type: 'split', nodeId: 'root', children: [{ type: 'leaf', nodeId: 'content', isDynamicHost: true }] };
  const mount = document.createElement('div');
  const first = renderLayoutTree(tree, mount);
  const article = document.createElement('article');
  first.get('content')!.append(article);
  const second = renderLayoutTree(tree, mount, true);
  expect(second.get('root')).toBe(first.get('root'));
  expect(second.get('content')).toBe(first.get('content'));
  expect(article.parentElement).toBe(second.get('content'));
  expect(() => renderLayoutTree({ type: 'leaf', nodeId: 'different' }, mount, true)).toThrow('RUNTIME_INITIAL_STRUCTURE_MISMATCH');
  expect(article.parentElement).toBe(first.get('content'));
});
