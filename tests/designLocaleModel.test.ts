import { localeDesign, readDesignLocalizations, resolveDesignLocale, saveDesignLocale, projectLocalizedDesign } from '../ui/shared/localization/designLocaleModel';
import { jsonDelta, applyJsonDelta, validateJsonDelta } from '../ui/shared/localization/jsonDelta';

const raw = () => ({ design: { id: 7, title: 'Shared layout', layout: { type: 'leaf', nodeId: 'article', isDynamicHost: true, height: 320,
  responsive: [{ id: 'mobile', maxWidth: 640, height: 200 }] } }, widgets: [{ instance_id: 'button', widget_id: 'button', html: '',
  metadata: { label: 'Read guide', image: '/media/guide.png', responsivePlacement: [{ id: 'mobile', width: 90 }] }, w_percent: 60 }] });

test('locale content and viewport deltas preserve shared attachments and other languages', () => {
  const base = localeDesign(raw());
  let localizations = readDesignLocalizations(base.layout);
  const chinese = structuredClone(base); chinese.widgets[0]!.code.meta.label = '阅读指南';
  chinese.layout!.responsive[0].height = 260;
  localizations = saveDesignLocale(base, localizations, 'zh', chinese).localizations;
  const swiss = structuredClone(base); swiss.layout!.height = 400;
  localizations = saveDesignLocale(base, localizations, 'de-ch', swiss).localizations;
  expect(resolveDesignLocale(base, localizations, 'en')).toEqual(base);
  expect(resolveDesignLocale(base, localizations, 'zh-cn')).toEqual(chinese);
  expect(resolveDesignLocale(base, localizations, 'de-ch')).toEqual(swiss);
  expect(JSON.stringify(localizations)).not.toContain('/media/guide.png');
  const updated = structuredClone(base); updated.layout!.height = 500; updated.layout!.responsive.push({ id: 'tablet', height: 380 });
  const inherited = resolveDesignLocale(updated, localizations, 'zh');
  expect(inherited.layout).toMatchObject({ height: 500, responsive: [{ id: 'mobile', height: 260 }, { id: 'tablet', height: 380 }] });
  expect(inherited.widgets[0]!.code.meta.label).toBe('阅读指南');
  expect(resolveDesignLocale(updated, localizations, 'de-ch').layout!.height).toBe(400);
});

test('regional edits keep parent overrides and restoring inherited content clears that override', () => {
  const base = localeDesign(raw()); const chinese = structuredClone(base); chinese.widgets[0]!.code.meta.label = '阅读';
  let localizations = saveDesignLocale(base, readDesignLocalizations(base.layout), 'zh', chinese).localizations;
  const regional = structuredClone(chinese); regional.layout!.height = 440;
  localizations = saveDesignLocale(base, localizations, 'zh-cn', regional).localizations;
  expect(resolveDesignLocale(base, localizations, 'zh-cn')).toEqual(regional);
  localizations = saveDesignLocale(base, localizations, 'zh-cn', chinese).localizations;
  expect(localizations.variants).not.toHaveProperty('zh-cn');
});

test('public projection keeps only selected content and persistent instance ids', () => {
  const response = raw(); const base = localeDesign(response); const edited = structuredClone(base); edited.layout!.height = 450;
  const localizations = saveDesignLocale(base, readDesignLocalizations(base.layout), 'zh', edited).localizations;
  const publicView = projectLocalizedDesign({ ...response, design: { ...response.design, layout: { ...response.design.layout, localizations } } }, 'zh');
  expect(publicView.design.layout.height).toBe(450);
  expect(publicView.design.layout).not.toHaveProperty('localizations');
  expect(publicView.widgets[0]).toMatchObject({ instance_id: 'button', widget_id: 'button' });
  expect(response.widgets[0]!.metadata.label).toBe('Read guide');
});

test('keyed diffs preserve newly added base nodes and reject malformed or prototype keys', () => {
  const base = [{ nodeId: 'a', width: 10 }, { nodeId: 'b', width: 20 }];
  const delta = jsonDelta(base, [{ nodeId: 'b', width: 30 }, { nodeId: 'a', width: 10 }]);
  validateJsonDelta(delta);
  expect(applyJsonDelta([...base, { nodeId: 'c', width: 50 }], delta)).toEqual([{ nodeId: 'b', width: 30 }, { nodeId: 'a', width: 10 }, { nodeId: 'c', width: 50 }]);
  expect(applyJsonDelta([base[0]], delta)).toEqual([base[0]]);
  expect(() => validateJsonDelta(JSON.parse('{"fields":{"__proto__":{"value":{}}}}'))).toThrow('DESIGN_LOCALE_DELTA_INVALID');
  expect(() => readDesignLocalizations({ localizations: { version: 1, variants: { EN: { value: {} } } } })).toThrow('DESIGN_LOCALE_CODE_INVALID');
});

test('explicit locale edits override legacy widget translations without changing the original catalog', () => {
  const response = raw(); response.widgets[0]!.metadata = { ...response.widgets[0]!.metadata, translations: { zh: { label: '原文' } } } as any;
  const base = localeDesign(response); let localizations = readDesignLocalizations(base.layout);
  const selected = resolveDesignLocale(base, localizations, 'zh-cn');
  expect(selected.widgets[0]!.code.meta.label).toBe('原文');
  selected.widgets[0]!.code.meta.label = '新译文';
  localizations = saveDesignLocale(base, localizations, 'zh-cn', selected).localizations;
  expect(resolveDesignLocale(base, localizations, 'zh-cn').widgets[0]!.code.meta.label).toBe('新译文');
  expect(base.widgets[0]!.code.meta.translations.zh.label).toBe('原文');
});
