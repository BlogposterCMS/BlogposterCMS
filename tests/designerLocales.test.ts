/** @jest-environment jsdom */
import { hydrateDesignerLocale, captureDesignerLocaleBaseline, prepareDesignerLocaleSave, designerLocaleState, requestDesignerLanguage } from '../ui/designer/app/localization/designerLocale';
import { localeDesign, projectLocalizedDesign } from '../ui/shared/localization/designLocaleModel';

test('the editor saves a sparse variant through the existing versioned save payload and commits only on success', async () => {
  history.replaceState({}, '', '/?lang=zh-cn');
  const raw = { design: { id: 3, version: 4, layout: { type: 'leaf', nodeId: 'content', isDynamicHost: true } },
    widgets: [{ instance_id: 'text', widget_id: 'text', metadata: { html: 'Source', src: '/media/source.png' } }] };
  const selected = localeDesign(hydrateDesignerLocale(raw));
  captureDesignerLocaleBaseline(selected.layout, selected.widgets);
  const changed = JSON.parse(JSON.stringify(selected)); changed.widgets[0]!.code.meta.html = '译文';
  const prepared = prepareDesignerLocaleSave({ design: { id: 3, version: 4, ...changed.styles }, layout: changed.layout, widgets: changed.widgets });
  expect(prepared.payload.design).toMatchObject({ id: 3, version: 4 });
  expect(prepared.payload.widgets[0].code.meta.html).toBe('Source');
  expect(designerLocaleState().hasOverride).toBe(false);
  prepared.commit();
  expect(designerLocaleState().hasOverride).toBe(true);
  const read = projectLocalizedDesign({ design: { ...prepared.payload.design, layout: prepared.payload.layout }, widgets: prepared.payload.widgets }, 'zh-cn');
  expect(read.widgets[0].code.meta).toMatchObject({ html: '译文', src: '/media/source.png' });
  window.blogposterDesignerCommands = { snapshot: () => ({ save: { dirty: true } }) } as any;
  await expect(requestDesignerLanguage('en')).rejects.toThrow('DESIGN_LOCALE_SAVE_REQUIRED');
  await expect(requestDesignerLanguage('bad language')).rejects.toThrow('DESIGN_LOCALE_CODE_INVALID');
  hydrateDesignerLocale(null as any);
});
