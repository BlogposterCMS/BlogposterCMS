import { resolveWidgetModuleUrl, resolveWidgetModuleImportUrl } from './widgetModulePaths.js';
export function resolveAllowedWidgetModuleUrl(input, base) {
    return resolveWidgetModuleUrl(input, base);
}
export async function loadWidgetModule(input, base) {
    const codeUrl = resolveWidgetModuleImportUrl(input, base);
    if (!codeUrl)
        return null;
    // Community code must never execute in the caller's browser realm.
    if (new URL(codeUrl).pathname.startsWith('/widgets/'))
        throw new Error('WIDGET_SANDBOX_REQUIRED');
    return import(/* webpackIgnore: true */ codeUrl);
}
