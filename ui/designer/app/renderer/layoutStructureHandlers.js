import { ensureLayoutRootContainer, setDefaultWorkarea } from '../managers/layoutContainerManager.js';

export function createLayoutStructureHandlers({
  layoutRootRef,
  sidebarEl,
  hasLayoutStructure,
  attachContainerBar,
  renderLayoutTreeSidebar,
  pushAndSave,
  layoutCtxProvider
}) {
  function getLayoutRoot() {
    return typeof layoutRootRef === 'function' ? layoutRootRef() : layoutRootRef?.current || layoutRootRef;
  }

  function refreshContainerBars() {
    if (!hasLayoutStructure) return;
    const layoutRoot = getLayoutRoot();
    const rootContainer = ensureLayoutRootContainer(layoutRoot);
    if (!rootContainer) return;
    rootContainer.querySelectorAll('.layout-container').forEach(el => {
      if (el.dataset.split === 'true') return;
      attachContainerBar(el, layoutCtxProvider());
    });
  }

  function refreshLayoutTree() {
    if (!hasLayoutStructure) return;
    const panel = sidebarEl?.querySelector?.('.layout-panel');
    if (!panel) return;
    const layoutRoot = getLayoutRoot();
    const rootContainer = ensureLayoutRootContainer(layoutRoot);
    if (!rootContainer) return;
    renderLayoutTreeSidebar(panel, rootContainer, el => {
      try {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('tree-selected');
        setTimeout(() => el.classList.remove('tree-selected'), 1000);
      } catch (err) {
        console.warn('[Designer] failed to focus layout tree node', err);
      }
    });
  }

  function handleContainerChange() {
    const layoutRoot = getLayoutRoot();
    ensureLayoutRootContainer(layoutRoot);
    setDefaultWorkarea(layoutRoot);
    refreshContainerBars();
    refreshLayoutTree();
    if (typeof pushAndSave === 'function') {
      pushAndSave();
    }
  }

  return {
    refreshContainerBars,
    refreshLayoutTree,
    handleContainerChange
  };
}
