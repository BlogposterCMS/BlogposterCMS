/** @jest-environment jsdom */
import { contentLanguageConfig, CONTENT_LANGUAGES_SETTING } from '../ui/shared/localization/contentLanguageConfig';
import { assertContentLanguage, loadContentLanguages } from '../ui/shared/localization/contentLanguages';
import { createContentLanguageControl } from '../ui/shared/localization/languageControl';
import { createContentLanguageSettings } from '../ui/widgets/plainspace/admin/settings/contentLanguageSettings';

const config = { version: 1, primaryLanguage: 'en', languages: ['en', 'zh-cn'] };
beforeEach(() => { document.body.replaceChildren(); window.meltdownEmit = jest.fn().mockResolvedValue({ [CONTENT_LANGUAGES_SETTING]: JSON.stringify(config) }); });

test('validates the single setting and preserves a regional locale', async () => {
  expect(contentLanguageConfig(null, 'de-CH')).toEqual({ version: 1, primaryLanguage: 'de-ch', languages: ['de-ch'] });
  expect(() => contentLanguageConfig({ ...config, primaryLanguage: 'fr' })).toThrow('CONTENT_LANGUAGES_PRIMARY_REQUIRED');
  expect(() => contentLanguageConfig({ ...config, languages: ['bad language'] })).toThrow('CONTENT_LANGUAGE_INVALID');
  expect(await loadContentLanguages()).toEqual(config);
  await expect(assertContentLanguage('zh-CN')).resolves.toBe('zh-cn');
  await expect(assertContentLanguage('fr')).rejects.toThrow('CONTENT_LANGUAGE_NOT_ENABLED');
  await expect(assertContentLanguage('fr', ['fr'])).resolves.toBe('fr');
});

test('shows only configured choices and guards no-op selection and unavailable actions', async () => {
  const open = jest.fn();
  const control = createContentLanguageControl(() => 'en', () => 'en', open, [{ label: 'Reset', available: () => false, run: jest.fn() }]);
  document.body.append(control.button); control.button.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(document.querySelector('input')).toBeNull();
  expect(document.querySelector('.bp-popover.app-scope .custom-select')).not.toBeNull();
  const select = document.querySelector('select')!;
  expect([...select.options].map(option => option.value)).toEqual(['en', 'zh-cn']);
  const apply = [...document.querySelectorAll('button')].find(button => button.textContent === 'Open language')!;
  expect(apply.disabled).toBe(true);
  expect([...document.querySelectorAll('button')].find(button => button.textContent === 'Reset')!.disabled).toBe(true);
  select.value = 'zh-cn'; select.dispatchEvent(new Event('change')); apply.click();
  await new Promise(resolve => setTimeout(resolve, 0)); expect(open).toHaveBeenCalledWith('zh-cn'); control.close();
});

test('central settings save the full configuration in one existing Settings write', async () => {
  const editor = await createContentLanguageSettings(window.meltdownEmit!, 'test');
  (editor.fields['de-ch'] as HTMLInputElement).checked = true;
  await editor.save();
  const payload = (window.meltdownEmit as jest.Mock).mock.calls.at(-1)[1];
  expect(payload).toMatchObject({ resource: 'settings', action: 'set', params: { key: CONTENT_LANGUAGES_SETTING } });
  expect(JSON.parse(payload.params.value)).toEqual({ ...config, languages: expect.arrayContaining(['en', 'zh-cn', 'de-ch']) });
});
