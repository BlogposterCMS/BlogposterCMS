import { emitRuntimeAdmin } from '../../../shared/api-client/runtimeFacade.js';

export type NativeDesignImport = { design: Record<string, unknown>; layout: Record<string, unknown>; widgets: Array<Record<string, any>> };
function invalid(message: string): never { throw new Error(`DESIGN_IMPORT_INVALID: ${message}`); }

/** A portable copy contains native presentation data, never executable widget packages. */
export function parseNativeDesignImport(text: string): NativeDesignImport {
  if (text.length > 1024 * 1024) invalid('Maximum file size is 1 MiB.');
  let value: NativeDesignImport;
  try { value = JSON.parse(text); } catch { invalid('Choose valid native design JSON.'); }
  let count = 0;
  function inspect(node: unknown, depth = 0): void {
    if (++count > 32000 || depth > 32) invalid('Design exceeds nesting or value limits.');
    if (!node || typeof node !== 'object') return;
    for (const [key, child] of Object.entries(node)) {
      if (['__proto__', 'prototype', 'constructor', 'allowCustomJs'].includes(key)
        || (key === 'js' && child)) invalid('Executable code and trust flags cannot be imported.');
      inspect(child, depth + 1);
    }
  }
  inspect(value);
  if (!value || typeof value !== 'object' || !value.design || typeof value.design.title !== 'string'
    || !value.design.title.trim() || value.design.title.length > 200 || !value.layout
    || !['leaf', 'split'].includes(String(value.layout.type))
    || !Array.isArray(value.widgets) || value.widgets.length > 500) invalid('Expected design, layout and up to 500 widgets.');
  const ids = new Set<string>();
  for (const widget of value.widgets) {
    if (!widget || typeof widget !== 'object' || typeof widget.id !== 'string' || !widget.id.trim()
      || ids.has(widget.id) || typeof widget.widgetId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(widget.widgetId)) invalid('Widget identities must be valid and unique.');
    ids.add(widget.id);
  }
  // A portable import always creates a new draft; it cannot overwrite or publish a source record.
  const { title, description, bgColor } = value.design;
  return { design: { title: title.trim(), description: typeof description === 'string' ? description : '', bgColor, isDraft: true },
    layout: value.layout, widgets: value.widgets };
}

export async function importNativeDesign(text: string): Promise<string> {
  const data = parseNativeDesignImport(text);
  if (!window.meltdownEmit) throw new Error('DESIGN_IMPORT_BRIDGE_MISSING');
  const saved = await emitRuntimeAdmin<{ id?: string | number }>(window.meltdownEmit, window.ADMIN_TOKEN, 'designer', 'save', data);
  if (!saved?.id) throw new Error('DESIGN_IMPORT_SAVE_RESULT_INVALID');
  return String(saved.id);
}
