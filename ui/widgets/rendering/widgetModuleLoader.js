import { resolveWidgetModuleUrl } from './widgetModulePaths.js';
export function resolveAllowedWidgetModuleUrl(input, base) {
    return resolveWidgetModuleUrl(input, base);
}
export async function loadWidgetModule(input, base) {
    const codeUrl = resolveWidgetModuleUrl(input, base);
    if (!codeUrl)
        return null;
    return import(/* webpackIgnore: true */ codeUrl);
}
