/** @jest-environment jsdom */
import { setAppViewLanguage } from '../ui/shell/apps/appViewState';

test('the view bridge keeps the current app route and page context while changing only its locale', () => {
  history.replaceState({ existing: true }, '', '/admin/app/designer/8?contentPageId=4&contentLang=en');
  expect(setAppViewLanguage({ language: 'zh-CN', url: 'https://example.test' })).toEqual({ language: 'zh-cn' });
  expect(location.pathname).toBe('/admin/app/designer/8');
  expect(new URLSearchParams(location.search).get('contentPageId')).toBe('4');
  expect(new URLSearchParams(location.search).get('contentLang')).toBe('zh-cn');
  expect(history.state).toEqual({ existing: true });
  expect(() => setAppViewLanguage({ language: 'javascript:bad' })).toThrow('APP_VIEW_LANGUAGE_INVALID');
});
