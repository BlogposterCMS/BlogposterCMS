/** @jest-environment jsdom */
import { importNativeDesign, parseNativeDesignImport } from '../ui/widgets/plainspace/admin/designerImportData';
import { emitRuntimeAdmin } from '../ui/shared/api-client/runtimeFacade';
jest.mock('../ui/shared/api-client/runtimeFacade', () => ({ emitRuntimeAdmin: jest.fn() }));
const source = { design: { id: 99, version: 42, title: 'Help', ownerId: 'source-user', isDraft: false, isGlobal: true },
  layout: { type: 'leaf', nodeId: 'body' }, widgets: [{ id: 'help-instance', widgetId: 'help', code: { meta: { workareaId: 'body', translations: { zh: { title: '帮助' } } } } }] };

test('portable copies retain native presentation and translations but discard source identity and publication flags', () => {
  const data = parseNativeDesignImport(JSON.stringify(source));
  expect(data.design).toEqual({ title: 'Help', description: '', isDraft: true });
  expect(data.widgets).toEqual(source.widgets);
  expect(data.layout).toEqual(source.layout);
});

test.each([
  { ...source, widgets: [source.widgets[0], source.widgets[0]] },
  { ...source, widgets: [{ ...source.widgets[0], code: { js: 'alert(1)' } }] },
  { ...source, widgets: [{ ...source.widgets[0], code: { meta: { allowCustomJs: true } } }] },
  { ...source, layout: null },
])('rejects executable flags, duplicate identities and malformed documents before saving', data => {
  expect(() => parseNativeDesignImport(JSON.stringify(data))).toThrow('DESIGN_IMPORT_INVALID');
});

test('rejects large and prototype-shaped inputs', () => {
  expect(() => parseNativeDesignImport(' '.repeat(1024 * 1024 + 1))).toThrow('DESIGN_IMPORT_INVALID');
  expect(() => parseNativeDesignImport(JSON.stringify(source).replace('"workareaId":"body"', '"__proto__":{}'))).toThrow('DESIGN_IMPORT_INVALID');
});

test('saves through the authoritative Designer adapter, as a new draft only', async () => {
  window.meltdownEmit = jest.fn();
  jest.mocked(emitRuntimeAdmin).mockResolvedValueOnce({ id: 101 });
  expect(await importNativeDesign(JSON.stringify(source))).toBe('101');
  expect(emitRuntimeAdmin).toHaveBeenCalledWith(window.meltdownEmit, window.ADMIN_TOKEN, 'designer', 'save', parseNativeDesignImport(JSON.stringify(source)));
});

test('retains server permission errors rather than substituting a direct write', async () => {
  jest.mocked(emitRuntimeAdmin).mockRejectedValueOnce(new Error('Forbidden'));
  await expect(importNativeDesign(JSON.stringify(source))).rejects.toThrow('Forbidden');
});
