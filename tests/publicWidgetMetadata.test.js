const { publicJsonValue } = require('../mother/modules/runtimeManager/publicWidgetMetadata');

test('published translated menus and nested UI conditions survive projection', () => {
  const value = {
    translations: { zh: { items: [{ label: '使用文档', href: '/docs?lang=zh', children: [{ label: '帮助', href: '/help' }] }] } },
    interaction: { view: { tag: 'div', children: [{ tag: 'div', children: [{ tag: 'p', when: { ref: 'data.articles.status', operator: 'equals', value: 'ready' } }] }] } }
  };
  expect(publicJsonValue(value)).toEqual(value);
});

test('metadata limits reject whole oversized values instead of dropping behavior conditions', () => {
  expect(() => publicJsonValue({ text: 'a'.repeat(262145) })).toThrow('PUBLIC_WIDGET_METADATA_LIMIT');
  expect(() => publicJsonValue(Array.from({ length: 16385 }, () => null))).toThrow('PUBLIC_WIDGET_METADATA_LIMIT');
  let deep = 'value'; for (let i = 0; i < 34; i++) deep = { child: deep };
  expect(() => publicJsonValue(deep)).toThrow('PUBLIC_WIDGET_METADATA_LIMIT');
  expect(publicJsonValue(JSON.parse('{"__proto__":{"polluted":true},"ok":true}'))).toEqual({ ok: true });
});
