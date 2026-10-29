import { googleAnalytics } from './googleAnalytics.js';
// Explicit, reviewed adapters follow Auth's provider-folder pattern. Extensions
// reuse the same consent lifecycle; settings cannot supply executable paths.
export const analyticsConnectors = [googleAnalytics];
