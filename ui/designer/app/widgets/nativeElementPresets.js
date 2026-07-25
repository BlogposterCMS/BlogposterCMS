export const NATIVE_ELEMENT_PREFIX = 'scene-native:';
export const INSERT_PRESET_PREFIX = 'scene-preset:';
export const NATIVE_ELEMENT_TYPES = ['text', 'media', 'shape', 'button', 'background'];

// Design Studio uses a 1px canvas grid. Keep initial and minimum dimensions in
// real pixels here so every insert path shares the same predictable contract.
const NATIVE_ELEMENT_DIMENSIONS = {
  text: {
    heading: { size: { w: 640, h: 128 }, minSize: { w: 240, h: 64 } },
    subheading: { size: { w: 520, h: 104 }, minSize: { w: 220, h: 64 } },
    paragraph: { size: { w: 480, h: 180 }, minSize: { w: 240, h: 96 } },
    quote: { size: { w: 520, h: 180 }, minSize: { w: 260, h: 120 } },
    list: { size: { w: 420, h: 200 }, minSize: { w: 240, h: 120 } },
    caption: { size: { w: 320, h: 72 }, minSize: { w: 180, h: 44 } }
  },
  media: {
    image: { size: { w: 480, h: 320 }, minSize: { w: 160, h: 120 } }
  },
  shape: {
    card: { size: { w: 320, h: 220 }, minSize: { w: 120, h: 80 } },
    divider: { size: { w: 520, h: 32 }, minSize: { w: 160, h: 16 } },
    spacer: { size: { w: 480, h: 96 }, minSize: { w: 120, h: 32 } }
  },
  button: {
    primary: { size: { w: 180, h: 52 }, minSize: { w: 120, h: 40 } },
    secondary: { size: { w: 180, h: 52 }, minSize: { w: 120, h: 40 } },
    plain: { size: { w: 160, h: 44 }, minSize: { w: 100, h: 36 } }
  }
};

const NATIVE_DEFAULT_VARIANTS = {
  text: 'subheading',
  media: 'image',
  shape: 'card',
  button: 'primary'
};

export const INSERT_TOOL_ITEMS = [
  {
    id: 'text',
    title: 'Text',
    icon: 'type',
    nativeType: 'text',
    description: 'Headings and copy presets',
    presets: [
      { id: 'text.heading', title: 'Heading', icon: 'heading-1', nativeType: 'text', variant: 'heading', description: 'Large H1 headline' },
      { id: 'text.subheading', title: 'Subheading', icon: 'heading-2', nativeType: 'text', variant: 'subheading', description: 'Section H2 headline' },
      { id: 'text.paragraph', title: 'Paragraph', icon: 'pilcrow', nativeType: 'text', variant: 'paragraph', description: 'Normal body text' },
      { id: 'text.quote', title: 'Quote', icon: 'quote', nativeType: 'text', variant: 'quote', description: 'Editorial pull quote' },
      { id: 'text.list', title: 'List', icon: 'list', nativeType: 'text', variant: 'list', description: 'Short bullet list' },
      { id: 'text.caption', title: 'Caption', icon: 'text', nativeType: 'text', variant: 'caption', description: 'Small supporting text' }
    ]
  },
  {
    id: 'media',
    title: 'Media',
    icon: 'image',
    nativeType: 'media',
    description: 'Images and galleries',
    presets: [
      { id: 'media.image', title: 'Image', icon: 'image', nativeType: 'media', variant: 'image', description: 'Single media block' },
      { id: 'media.gallery', title: 'Gallery', icon: 'images', widgetId: 'gallery', description: 'Image grid', size: { w: 720, h: 420 }, minSize: { w: 360, h: 240 }, settings: { mode: 'grid', columns: 3 } },
      { id: 'media.masonry', title: 'Masonry', icon: 'gallery-thumbnails', widgetId: 'gallery', description: 'Masonry gallery', size: { w: 720, h: 460 }, minSize: { w: 360, h: 260 }, settings: { mode: 'masonry', columns: 3, heightMode: 'natural' } },
      { id: 'media.carousel', title: 'Carousel', icon: 'gallery-horizontal', widgetId: 'gallery', description: 'Slider gallery', size: { w: 800, h: 420 }, minSize: { w: 400, h: 240 }, settings: { mode: 'carousel', showControls: true, showDots: true } },
      { id: 'media.background', title: 'Background', icon: 'wallpaper', nativeType: 'background', description: 'Section background' }
    ]
  },
  {
    id: 'shape',
    title: 'Shape',
    icon: 'shapes',
    nativeType: 'shape',
    description: 'Visual accents',
    presets: [
      { id: 'shape.card', title: 'Soft shape', icon: 'square-round-corner', nativeType: 'shape', variant: 'card', description: 'Rounded accent block' },
      { id: 'shape.divider', title: 'Divider', icon: 'separator-horizontal', nativeType: 'shape', variant: 'divider', description: 'Horizontal rule' },
      { id: 'shape.spacer', title: 'Spacer', icon: 'rows-2', nativeType: 'shape', variant: 'spacer', description: 'Intentional whitespace' }
    ]
  },
  {
    id: 'button',
    title: 'Button',
    icon: 'mouse-pointer-click',
    nativeType: 'button',
    description: 'Actions and links',
    presets: [
      { id: 'button.primary', title: 'Primary button', icon: 'mouse-pointer-click', nativeType: 'button', variant: 'primary', description: 'Main call to action' },
      { id: 'button.secondary', title: 'Secondary button', icon: 'square-mouse-pointer', nativeType: 'button', variant: 'secondary', description: 'Secondary action' },
      { id: 'button.link', title: 'Text link', icon: 'link', nativeType: 'button', variant: 'plain', description: 'Inline-style link' }
    ]
  },
  {
    id: 'navigation',
    title: 'Navigation',
    icon: 'menu',
    description: 'Menus and breadcrumbs',
    presets: [
      { id: 'navigation.menu', title: 'Menu', icon: 'menu', widgetId: 'navigationMenu', description: 'Public menu renderer', size: { w: 760, h: 64 }, minSize: { w: 320, h: 48 }, settings: { locationKey: 'primary', orientation: 'horizontal', maxDepth: 2 } },
      { id: 'navigation.breadcrumb', title: 'Breadcrumb', icon: 'chevrons-right', widgetId: 'breadcrumb', description: 'Page path trail', size: { w: 640, h: 48 }, minSize: { w: 260, h: 40 }, settings: { homeLabel: 'Home', separator: '/' } }
    ]
  },
  {
    id: 'content',
    title: 'Content',
    icon: 'archive',
    description: 'Page and collection lists',
    presets: [
      { id: 'content.collectionArchive', title: 'Collection Archive', icon: 'archive', widgetId: 'collectionArchive', description: 'Cards from a selected collection', size: { w: 960, h: 520 }, minSize: { w: 480, h: 260 }, settings: { collectionId: '', columns: 3, buttonLabel: 'Read more' } }
    ]
  }
];

const TEXT_VARIANTS = {
  heading: {
    label: 'Heading',
    elementName: 'Heading',
    html: '<h1>New headline</h1>',
    settings: {
      html: '<h1>New headline</h1>',
      label: 'Heading'
    }
  },
  subheading: {
    label: 'Subheading',
    elementName: 'Subheading',
    html: '<h2>Add a supporting heading</h2>',
    settings: {
      html: '<h2>Add a supporting heading</h2>',
      label: 'Subheading'
    }
  },
  paragraph: {
    label: 'Paragraph',
    elementName: 'Paragraph',
    html: '<p>Write your copy</p>',
    settings: {
      html: '<p>Write your copy</p>',
      label: 'Paragraph'
    }
  },
  quote: {
    label: 'Quote',
    elementName: 'Quote',
    html: '<blockquote>Share a short quote or proof point.</blockquote>',
    settings: {
      html: '<blockquote>Share a short quote or proof point.</blockquote>',
      label: 'Quote'
    }
  },
  list: {
    label: 'List',
    elementName: 'List',
    html: '<ul><li>First point</li><li>Second point</li><li>Third point</li></ul>',
    settings: {
      html: '<ul><li>First point</li><li>Second point</li><li>Third point</li></ul>',
      label: 'List'
    }
  },
  caption: {
    label: 'Caption',
    elementName: 'Caption',
    html: '<p><small>Add a caption or note</small></p>',
    settings: {
      html: '<p><small>Add a caption or note</small></p>',
      label: 'Caption'
    }
  }
};

const SHAPE_VARIANTS = {
  card: {
    label: 'Shape',
    elementName: 'Shape',
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
    settings: {
      radius: 18,
      style: 'soft-card'
    }
  },
  divider: {
    label: 'Divider',
    elementName: 'Divider',
    html: '<div class="scene-native-divider" aria-hidden="true"></div>',
    css: `
.scene-native-divider {
  width: 100%;
  height: 100%;
  min-height: 12px;
  display: grid;
  place-items: center;
}
.scene-native-divider::before {
  content: "";
  display: block;
  width: 100%;
  height: 1px;
  background: rgba(18, 21, 34, 0.16);
}
    `.trim(),
    settings: {
      style: 'divider'
    }
  },
  spacer: {
    label: 'Spacer',
    elementName: 'Spacer',
    html: '<div class="scene-native-spacer" aria-hidden="true"></div>',
    css: `
.scene-native-spacer {
  width: 100%;
  height: 100%;
  min-height: 100%;
}
    `.trim(),
    settings: {
      style: 'spacer'
    }
  }
};

const BUTTON_VARIANTS = {
  primary: { label: 'Start now', variant: 'primary' },
  secondary: { label: 'Learn more', variant: 'secondary' },
  plain: { label: 'Read more', variant: 'plain' }
};

function normalizeVariant(value, allowed, fallback) {
  const normalized = String(value || '').trim().toLowerCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

export function getInsertToolItem(id) {
  const needle = String(id || '').trim();
  return INSERT_TOOL_ITEMS.find(item => item.id === needle) || null;
}

export function getInsertPreset(id) {
  const needle = String(id || '').replace(INSERT_PRESET_PREFIX, '').trim();
  if (!needle) return null;
  for (const group of INSERT_TOOL_ITEMS) {
    const direct = (group.presets || []).find(item => item.id === needle);
    if (direct) return { ...direct, groupId: group.id };
  }
  for (const group of INSERT_TOOL_ITEMS) {
    const shorthand = (group.presets || []).find(item => item.id.split('.').pop() === needle);
    if (shorthand) return { ...shorthand, groupId: group.id };
  }
  return null;
}

export function normalizeNativeElementType(value) {
  const type = String(value || '').replace(NATIVE_ELEMENT_PREFIX, '').trim().toLowerCase();
  return NATIVE_ELEMENT_TYPES.includes(type) ? type : '';
}

function nativeElementDimensions(type, variant = '') {
  const nativeType = normalizeNativeElementType(type);
  const variants = NATIVE_ELEMENT_DIMENSIONS[nativeType];
  if (!variants) return null;
  const requestedVariant = String(variant || '').trim().toLowerCase();
  const fallbackVariant = NATIVE_DEFAULT_VARIANTS[nativeType];
  return variants[requestedVariant] || variants[fallbackVariant] || null;
}

export function getNativeElementSize(type, defaultRows = 100, variant = '') {
  const nativeType = normalizeNativeElementType(type);
  const dimensions = nativeElementDimensions(nativeType, variant);
  if (dimensions) return { ...dimensions.size };
  if (nativeType === 'background') return { w: 960, h: Math.max(1, defaultRows) };
  return { w: 480, h: Math.max(240, defaultRows) };
}

export function getNativeElementMinSize(type, variant = '') {
  const dimensions = nativeElementDimensions(type, variant);
  return dimensions ? { ...dimensions.minSize } : { w: 240, h: 120 };
}

function sceneMeta(context = {}, kind, settings = {}) {
  const variant = String(context.variant || settings.variant || '').trim();
  const presetId = String(context.presetId || (variant ? `native.${kind}.${variant}` : `native.${kind}`));
  return {
    kind,
    presetId,
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
    const variantKey = normalizeVariant(context.variant, Object.keys(TEXT_VARIANTS), 'subheading');
    const variant = TEXT_VARIANTS[variantKey];
    return {
      type: nativeType,
      label: variant.label,
      elementName: variant.elementName,
      size: getNativeElementSize(nativeType, 100, variantKey),
      minSize: getNativeElementMinSize(nativeType, variantKey),
      preferredWidgetIds: ['textBox'],
      keywords: ['text', 'type', 'copy'],
      code: {
        meta: sceneMeta({ ...context, variant: variantKey }, 'text', {
          variant: variantKey,
          ...variant.settings
        })
      }
    };
  }
  if (nativeType === 'shape') {
    const variantKey = normalizeVariant(context.variant, Object.keys(SHAPE_VARIANTS), 'card');
    const variant = SHAPE_VARIANTS[variantKey];
    return {
      type: nativeType,
      label: variant.label,
      elementName: variant.elementName,
      size: getNativeElementSize(nativeType, 100, variantKey),
      minSize: getNativeElementMinSize(nativeType, variantKey),
      preferredWidgetIds: ['htmlBlock'],
      keywords: ['html', 'shape', 'block', 'box'],
      code: {
        html: variant.html,
        css: variant.css,
        meta: sceneMeta({ ...context, variant: variantKey }, 'shape', {
          variant: variantKey,
          ...variant.settings
        })
      }
    };
  }
  if (nativeType === 'media') {
    const mediaUrl = String(context.mediaUrl || '');
    return {
      type: nativeType,
      label: 'Media',
      elementName: 'Media',
      size: getNativeElementSize(nativeType, 100, 'image'),
      minSize: getNativeElementMinSize(nativeType, 'image'),
      preferredWidgetIds: ['mediaBlock', 'htmlBlock'],
      keywords: ['media', 'image', 'picture'],
      code: {
        meta: sceneMeta(context, 'media', {
          mediaUrl,
          src: mediaUrl,
          aspectRatio: '16/9',
          fit: 'cover'
        })
      }
    };
  }
  if (nativeType === 'button') {
    const variantKey = normalizeVariant(context.variant, Object.keys(BUTTON_VARIANTS), 'primary');
    const variant = BUTTON_VARIANTS[variantKey];
    const label = String(context.label || variant.label || 'Start now');
    const href = String(context.href || '#');
    return {
      type: nativeType,
      label: variantKey === 'plain' ? 'Text link' : variantKey === 'secondary' ? 'Secondary button' : 'Primary button',
      elementName: variantKey === 'plain' ? 'Text link' : 'Button',
      size: getNativeElementSize(nativeType, 100, variantKey),
      minSize: getNativeElementMinSize(nativeType, variantKey),
      behavior: 'scroll',
      preferredWidgetIds: ['buttonLink', 'htmlBlock'],
      keywords: ['button', 'cta', 'action', 'html', 'block'],
      code: {
        meta: sceneMeta({ ...context, variant: variantKey }, 'button', {
          variant: variant.variant,
          label,
          href
        })
      }
    };
  }
  return null;
}
