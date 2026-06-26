import {
  createNativeElementPreset,
  getNativeElementSize,
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
      sceneBackground: '#ffffff'
    });

    expect(preset?.preferredWidgetIds).toContain('htmlBlock');
    expect(preset?.code.meta).toEqual(expect.objectContaining({
      kind: 'button',
      presetId: 'native.button',
      presetVersion: 1,
      sceneId: 'hero',
      designContract: {
        version: 1,
        source: 'design-studio-preset'
      }
    }));
    expect(preset?.code.html).toContain('scene-native-button');
  });

  it('keeps layout sizes outside normal widget metadata', () => {
    expect(getNativeElementSize('background', 120)).toEqual({ w: 12, h: 120 });
    expect(getNativeElementSize('shape', 120)).toEqual({ w: 4, h: 80 });
  });
});
