export const NATIVE_ELEMENT_PREFIX = 'scene-native:';
export const NATIVE_ELEMENT_TYPES = ['text', 'media', 'shape', 'button', 'background'];

export const INSERT_TOOL_ITEMS = [
  { id: 'text', title: 'Text', icon: 'type' },
  { id: 'media', title: 'Media', icon: 'image' },
  { id: 'shape', title: 'Shape', icon: 'shapes' },
  { id: 'button', title: 'Button', icon: 'mouse-pointer-click' },
  { id: 'background', title: 'Background', icon: 'wallpaper' }
];

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch] || ch));
}

function escapeAttribute(value = '') {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

export function normalizeNativeElementType(value) {
  const type = String(value || '').replace(NATIVE_ELEMENT_PREFIX, '').trim().toLowerCase();
  return NATIVE_ELEMENT_TYPES.includes(type) ? type : '';
}

export function getNativeElementSize(type, defaultRows = 100) {
  switch (normalizeNativeElementType(type)) {
    case 'text':
      return { w: 5, h: 72 };
    case 'media':
      return { w: 5, h: 96 };
    case 'shape':
      return { w: 4, h: 80 };
    case 'button':
      return { w: 3, h: 54 };
    case 'background':
      return { w: 12, h: defaultRows };
    default:
      return { w: 4, h: defaultRows };
  }
}

function sceneMeta(context = {}, kind, settings = {}) {
  return {
    kind,
    presetId: `native.${kind}`,
    presetVersion: 1,
    designContract: {
      version: 1,
      source: 'design-studio-preset'
    },
    settings,
    sceneId: context.sceneId || '',
    sceneTitle: context.sceneTitle || '',
    sceneBackground: context.sceneBackground || ''
  };
}

export function createNativeElementPreset(type, context = {}) {
  const nativeType = normalizeNativeElementType(type);
  if (nativeType === 'text') {
    return {
      type: nativeType,
      label: 'Text',
      elementName: 'Text',
      preferredWidgetIds: ['textBox'],
      keywords: ['text', 'type', 'copy'],
      code: {
        html: '<div class="scene-native-text editable" data-text-editable><h2>New headline</h2><p>Describe this section</p></div>',
        css: `
.scene-native-text {
  width: 100%;
  min-height: 100%;
  display: grid;
  align-content: center;
  gap: 8px;
  color: #151827;
  font-family: Inter, system-ui, sans-serif;
}
.scene-native-text h2 {
  margin: 0;
  color: #151827;
  font-size: 32px;
  line-height: 1.05;
  font-weight: 700;
  letter-spacing: 0;
}
.scene-native-text p {
  margin: 0;
  color: #7a8297;
  font-size: 14px;
  line-height: 1.5;
  font-weight: 500;
}
        `.trim(),
        meta: sceneMeta(context, 'text', {
          label: 'Text',
          heading: 'New headline',
          body: 'Describe this section'
        })
      }
    };
  }
  if (nativeType === 'shape') {
    return {
      type: nativeType,
      label: 'Shape',
      elementName: 'Shape',
      preferredWidgetIds: ['htmlBlock'],
      keywords: ['html', 'shape', 'block', 'box'],
      code: {
        html: '<div class="scene-native-shape" aria-hidden="true"></div>',
        css: `
.scene-native-shape {
  width: 100%;
  height: 100%;
  min-height: 100%;
  border-radius: 18px;
  background:
    radial-gradient(circle at 28% 22%, rgba(255, 255, 255, 0.72), transparent 36%),
    linear-gradient(135deg, #f8fafc 0%, #eceeff 48%, #dbe5f6 100%);
  border: 1px solid rgba(102, 92, 246, 0.16);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.75), 0 22px 48px rgba(42, 50, 73, 0.12);
}
        `.trim(),
        meta: sceneMeta(context, 'shape', {
          radius: 18,
          style: 'soft-card'
        })
      }
    };
  }
  if (nativeType === 'media') {
    const mediaUrl = String(context.mediaUrl || '');
    const safeUrl = escapeAttribute(mediaUrl);
    return {
      type: nativeType,
      label: 'Media',
      elementName: 'Media',
      preferredWidgetIds: ['htmlBlock', 'mediaExplorer'],
      keywords: ['media', 'image', 'picture'],
      code: {
        html: safeUrl
          ? `<figure class="scene-native-media"><img src="${safeUrl}" alt="" /></figure>`
          : '<figure class="scene-native-media scene-native-media--empty"><span>Media</span></figure>',
        css: `
.scene-native-media {
  width: 100%;
  height: 100%;
  min-height: 100%;
  margin: 0;
  overflow: hidden;
  border-radius: 18px;
  background: #f7f8fb;
  border: 1px solid rgba(18, 21, 34, 0.08);
  box-shadow: 0 22px 48px rgba(42, 50, 73, 0.12);
}
.scene-native-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.scene-native-media--empty {
  display: grid;
  place-items: center;
  color: #7a8297;
  font: 600 13px/1.2 Inter, system-ui, sans-serif;
  background:
    linear-gradient(135deg, rgba(102, 92, 246, 0.08), rgba(40, 189, 186, 0.08)),
    #f7f8fb;
}
        `.trim(),
        meta: sceneMeta(context, 'media', {
          mediaUrl
        })
      }
    };
  }
  if (nativeType === 'button') {
    const label = String(context.label || 'Start now');
    const href = String(context.href || '#');
    return {
      type: nativeType,
      label: 'Button',
      elementName: 'Button',
      behavior: 'scroll',
      preferredWidgetIds: ['htmlBlock'],
      keywords: ['button', 'cta', 'action', 'html', 'block'],
      code: {
        html: `<a class="scene-native-button" href="${escapeAttribute(href)}" role="button">${escapeHtml(label)}</a>`,
        css: `
.scene-native-button {
  width: 100%;
  height: 100%;
  min-height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 22px;
  box-sizing: border-box;
  border: 0;
  border-radius: 999px;
  background: linear-gradient(135deg, #151827 0%, #2a2f44 100%);
  color: #fff;
  font: 700 14px/1 Inter, system-ui, sans-serif;
  text-decoration: none;
  letter-spacing: 0;
  box-shadow: 0 18px 34px rgba(18, 21, 34, 0.18);
}
.scene-native-button:focus-visible {
  outline: 2px solid rgba(102, 92, 246, 0.44);
  outline-offset: 4px;
}
        `.trim(),
        meta: sceneMeta(context, 'button', {
          label,
          href
        })
      }
    };
  }
  return null;
}
