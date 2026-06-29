import {
  createNativeElementPreset,
  getInsertPreset,
  getNativeElementSize,
  INSERT_TOOL_ITEMS,
  normalizeNativeElementType
} from '../ui/designer/app/widgets/nativeElementPresets';

describe('designer native element presets', () => {
  it('normalizes native element drag payloads', () => {
    expect(normalizeNativeElementType('scene-native:text')).toBe('text');
    expect(normalizeNativeElementType('unknown')).toBe('');
  });

  it('creates typed Design Studio presets with design-contract metadata', () => {
    const preset = createNativeElementPreset('button', {
      sceneId: 'hero',
      sceneTitle: 'Hero',
      sceneBackground: '#ffffff',
      variant: 'secondary'
    });

    expect(preset?.preferredWidgetIds).toContain('buttonLink');
    expect(preset?.preferredWidgetIds).toContain('htmlBlock');
    expect(preset?.code.meta).toEqual(expect.objectContaining({
      kind: 'button',
      presetId: 'native.button.secondary',
      presetVersion: 1,
      sceneId: 'hero',
      designContract: {
        version: 1,
        source: 'design-studio-preset'
      },
      settings: expect.objectContaining({
        variant: 'secondary'
      })
    }));
    expect(preset?.code.html).toBeUndefined();
  });

  it('groups insert presets under minimal sidebar tools', () => {
    expect(INSERT_TOOL_ITEMS.map(item => item.id)).toEqual([
      'text',
      'media',
      'shape',
      'button',
      'navigation'
    ]);
    expect(getInsertPreset('gallery')).toEqual(expect.objectContaining({
      id: 'media.gallery',
      widgetId: 'gallery'
    }));
    expect(getInsertPreset('navigation.menu')).toEqual(expect.objectContaining({
      widgetId: 'navigationMenu'
    }));
  });

  it('keeps layout sizes outside normal widget metadata', () => {
    expect(getNativeElementSize('background', 120)).toEqual({ w: 12, h: 120 });
    expect(getNativeElementSize('shape', 120)).toEqual({ w: 4, h: 80 });
  });
});
