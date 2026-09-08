/**
 * @jest-environment jsdom
 */

import {
  applyColorLibraryVariables,
  colorLibraryAgentState,
  configureColorLibraryClient,
  createLibraryColor,
  getColorPickerSavedColors,
  linkedColorValue,
  parseLinkedColorValue,
  refreshColorLibrary
} from '../ui/shared/colors/colorLibrary';

beforeEach(() => {
  document.head.innerHTML = '';
  document.documentElement.removeAttribute('data-bp-color-library-ready');
});

test('light and dark slots emit scoped CSS without changing stored literal overrides', () => {
  const colors = [{ id: 'default-1', name: 'Primary', value: '#111111', darkValue: '#EEEEEE' }];
  const style = applyColorLibraryVariables({ version: 2, activeSchemeId: 'scheme-test', schemes: [{ id: 'scheme-test', name: 'Test', colors }], colors });
  expect(style.textContent).toContain('--bp-color-default-1: #111111');
  expect(style.textContent).toContain(':root[data-theme="dark"]');
  expect(style.textContent).toContain('--bp-color-default-1: #EEEEEE');
  expect(style.textContent).toContain('prefers-color-scheme: dark');
  const item = document.createElement('span'); item.style.color = '#123456';
  document.body.appendChild(item);
  applyColorLibraryVariables({ version: 2, activeSchemeId: '', schemes: [], colors });
  expect(item.style.color).toBe('rgb(18, 52, 86)');
});

test('browser color library loads named colors and publishes stable CSS variables', async () => {
  const initial = {
    version: 2,
    activeSchemeId: 'color-scheme-default',
    schemes: [{
      id: 'color-scheme-default',
      name: 'Default',
      colors: [{
      id: 'default-1',
      name: 'Brand Blue',
      value: '#0066CC'
      }]
    }],
    colors: [{
      id: 'default-1',
      name: 'Brand Blue',
      value: '#0066CC'
    }]
  };
  const emit = jest.fn(async (_eventName: string, payload: Record<string, unknown>) => {
    if (payload.action === 'list') return initial;
    if (payload.action === 'create') {
      const color = {
        id: 'default-2',
        name: String((payload.params as Record<string, unknown>).name),
        value: String((payload.params as Record<string, unknown>).value)
      };
      return {
        color,
        library: {
          ...initial,
          schemes: [{
            ...initial.schemes[0],
            colors: [...initial.colors, color]
          }],
          colors: [...initial.colors, color]
        }
      };
    }
    return null;
  });

  configureColorLibraryClient({
    emit: emit as NonNullable<Window['meltdownEmit']>,
    token: 'admin-token',
    lane: 'admin'
  });
  await refreshColorLibrary();

  const pickerColors = getColorPickerSavedColors();
  expect(pickerColors).toHaveLength(1);
  expect(pickerColors[0]).toMatchObject({
    name: 'Brand Blue',
    value: '#0066CC',
    cssValue: 'var(--bp-color-default-1, #0066CC)'
  });
  expect(document.getElementById('bp-color-library-tokens')?.textContent)
    .toContain('--bp-color-default-1: #0066CC');
  expect(document.documentElement.dataset.bpColorLibraryReady).toBe('true');

  await createLibraryColor({ name: 'Accent', value: '#FF5500' });
  expect(getColorPickerSavedColors()).toHaveLength(2);
  expect(emit).toHaveBeenLastCalledWith('cmsAdminApiRequest', expect.objectContaining({
    resource: 'colors',
    action: 'create',
    params: { name: 'Accent', value: '#FF5500' }
  }));
  expect(colorLibraryAgentState()).toMatchObject({
    status: 'ready',
    schemeCount: 1,
    activeSchemeId: 'color-scheme-default',
    colorCount: 2
  });
});

test('linked values retain a literal fallback and can be parsed again', () => {
  const color = {
    id: 'default-1',
    value: '#0066CC'
  };
  const value = linkedColorValue(color);
  expect(parseLinkedColorValue(value)).toEqual({
    id: color.id,
    fallback: color.value
  });

  const style = applyColorLibraryVariables({
    version: 2,
    activeSchemeId: 'color-scheme-default',
    schemes: [{
      id: 'color-scheme-default',
      name: 'Default',
      colors: [{ ...color, name: 'Brand Blue' }]
    }],
    colors: [{ ...color, name: 'Brand Blue' }]
  });
  expect(style.dataset.colorLibrary).toBe('true');
});
