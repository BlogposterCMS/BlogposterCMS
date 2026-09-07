/** Resolve the selected nested Container before falling back to its Section. */
export function parentLayoutContainer(element, layoutRoot) {
  const parent = element?.parentElement?.closest('.layout-container');
  // The page root is not a Section; do not accidentally edit it via this action.
  return parent && parent !== layoutRoot && layoutRoot?.contains(parent) ? parent : null;
}

export function inspectorLayoutContainer(layoutRoot, sectionId) {
  const section = Array.from(layoutRoot?.querySelectorAll('.layout-section') || [])
    .find(el => el.dataset.sectionId === String(sectionId));
  return section?.querySelector('.layout-container--active') || section || null;
}

/** Visual focus follows the saved content outlet, never the active Section flag. */
export function bindEditingScope({ layoutRoot, onSelect } = {}) {
  if (!layoutRoot) return null;
  let scope = 'layout';
  let frame = 0;
  const hostSelector = '.layout-container[data-dynamic-host="true"]';

  function refresh() {
    observer.disconnect();
    layoutRoot.querySelectorAll('[data-designer-edit-overlay]').forEach(el => el.remove());
    const host = layoutRoot.querySelector(hostSelector);
    layoutRoot.dataset.editingScope = host ? scope : 'design';
    if (host) {
      // Only cover maximal inactive branches, so a parent Section containing
      // both navigation and the outlet never hides its active descendants.
      const targets = [];
      function visit(node) {
        if (node === host || host.contains(node)) return;
        if (!node.contains(host)) { targets.push(node); return; }
        Array.from(node.children).filter(el => el.matches('.layout-container, .canvas-item[data-widget-id]')).forEach(visit);
      }
      if (scope === 'layout') targets.push(host);
      else visit(layoutRoot);
      targets.forEach(target => {
        const overlay = document.createElement('div');
        overlay.dataset.designerEditOverlay = scope === 'layout' ? 'content' : 'layout';
        overlay.className = 'designer-edit-scope-overlay';
        overlay.setAttribute('role', 'button');
        overlay.tabIndex = 0;
        const label = scope === 'layout' ? 'Page content area' : 'Layout';
        overlay.setAttribute('aria-label', `${label}: double-click or press Enter to edit`);
        const badge = document.createElement('span');
        badge.textContent = `${label} · Double-click to edit`;
        overlay.append(badge);
        const activate = event => {
          event.preventDefault();
          event.stopPropagation();
          scope = overlay.dataset.designerEditOverlay;
          refresh();
          onSelect?.(target);
        };
        overlay.addEventListener('dblclick', activate);
        overlay.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') activate(event);
        });
        // The veil is an editor affordance; single clicks must not drag or
        // edit a covered widget before the author changes focus explicitly.
        ['pointerdown', 'click'].forEach(type => overlay.addEventListener(type, event => {
          event.preventDefault();
          event.stopPropagation();
        }));
        target.append(overlay);
      });
    }
    observer.observe(layoutRoot, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-dynamic-host'] });
  }
  const observer = new MutationObserver(() => {
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; refresh(); });
  });
  const blockCoveredPointer = event => {
    if (!event.target?.closest?.('[data-designer-edit-overlay]')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  layoutRoot.addEventListener('pointerdown', blockCoveredPointer, true);
  layoutRoot.addEventListener('click', blockCoveredPointer, true);
  refresh();
  return { refresh, destroy() {
    observer.disconnect();
    cancelAnimationFrame(frame);
    layoutRoot.removeEventListener('pointerdown', blockCoveredPointer, true);
    layoutRoot.removeEventListener('click', blockCoveredPointer, true);
    layoutRoot.querySelectorAll('[data-designer-edit-overlay]').forEach(el => el.remove());
    delete layoutRoot.dataset.editingScope;
  } };
}
