import { resolveWidgetModuleUrl } from './widgetModulePaths.js';

export type WidgetRenderModule = {
  render?: (container: HTMLElement, context: Record<string, any>) => void | Promise<void>;
};

export function resolveAllowedWidgetModuleUrl(input: unknown, base?: string): string | null {
  return resolveWidgetModuleUrl(input, base);
}

export async function loadWidgetModule(input: unknown, base?: string): Promise<WidgetRenderModule | null> {
  const codeUrl = resolveWidgetModuleUrl(input, base);
  if (!codeUrl) return null;

  return import(/* webpackIgnore: true */ codeUrl) as Promise<WidgetRenderModule>;
}
