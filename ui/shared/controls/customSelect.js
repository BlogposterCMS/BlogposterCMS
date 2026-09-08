import enhanceSelects from './customSelectCore.js';
export { default, destroyCustomSelects } from './customSelectCore.js';
// Admin entry point retains automatic enhancement; public widgets import the core.
function startCustomSelects() {
    // Embedded editors enhance their chrome only, leaving authored controls
    // inside the canvas untouched. Ordinary Admin pages retain auto discovery.
    if (document.body?.dataset.customSelectScope === 'explicit') {
        document.querySelectorAll('[data-ui-controls]').forEach(root => enhanceSelects(root));
    }
    else
        enhanceSelects(document);
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startCustomSelects, { once: true });
}
else {
    startCustomSelects();
}
