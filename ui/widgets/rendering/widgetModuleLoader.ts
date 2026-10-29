import { resolveWidgetModuleUrl, resolveWidgetModuleImportUrl } from './widgetModulePaths.js';

export type WidgetRenderModule = {
  render?: (container: HTMLElement, context: Record<string, any>) => void | Promise<void>;
};

export function resolveAllowedWidgetModuleUrl(input: unknown, base?: string): string | null {
  return resolveWidgetModuleUrl(input, base);
}

export async function loadWidgetModule(input: unknown, base?: string): Promise<WidgetRenderModule | null> {
  const codeUrl = resolveWidgetModuleImportUrl(input, base);
  if (!codeUrl) return null;
  // Community code must never execute in the caller's browser realm.
  if (new URL(codeUrl).pathname.startsWith('/widgets/')) throw new Error('WIDGET_SANDBOX_REQUIRED');

  return import(/* webpackIgnore: true */ codeUrl) as Promise<WidgetRenderModule>;
}
