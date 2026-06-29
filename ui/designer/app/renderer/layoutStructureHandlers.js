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

  function warnLayoutStructure(code, err, detail = {}) {
    console.warn(`[Designer] ${code}`, detail, err);
  }

  function refreshContainerBars() {
    if (!hasLayoutStructure) return;
    const layoutRoot = getLayoutRoot();
    let rootContainer = null;
    try {
      rootContainer = ensureLayoutRootContainer(layoutRoot);
    } catch (err) {
      warnLayoutStructure('DESIGNER_LAYOUT_ROOT_ENSURE_FAILED', err);
      return;
    }
    if (!rootContainer) return;
    const containers = [
      rootContainer,
      ...Array.from(rootContainer.querySelectorAll('.layout-container'))
    ];
    containers.forEach(el => {
      try {
        attachContainerBar(el, layoutCtxProvider());
      } catch (err) {
        warnLayoutStructure('DESIGNER_CONTAINER_BAR_ATTACH_FAILED', err, {
          nodeId: el?.dataset?.nodeId || null
        });
      }
    });
  }

  function refreshLayoutTree() {
    if (!hasLayoutStructure) return;
    const panel = sidebarEl?.querySelector?.('.layout-panel');
    if (!panel) return;
    const layoutRoot = getLayoutRoot();
    let rootContainer = null;
    try {
      rootContainer = ensureLayoutRootContainer(layoutRoot);
    } catch (err) {
      warnLayoutStructure('DESIGNER_LAYOUT_ROOT_ENSURE_FAILED', err);
      return;
    }
    if (!rootContainer) return;
    try {
      renderLayoutTreeSidebar(panel, rootContainer, el => {
        try {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('tree-selected');
          setTimeout(() => el.classList.remove('tree-selected'), 1000);
        } catch (err) {
          warnLayoutStructure('DESIGNER_LAYOUT_TREE_FOCUS_FAILED', err);
        }
      });
    } catch (err) {
      warnLayoutStructure('DESIGNER_LAYOUT_TREE_RENDER_FAILED', err);
    }
  }

  function handleContainerChange() {
    const layoutRoot = getLayoutRoot();
    let normalized = true;
    try {
      ensureLayoutRootContainer(layoutRoot);
      setDefaultWorkarea(layoutRoot);
    } catch (err) {
      normalized = false;
      warnLayoutStructure('DESIGNER_CONTAINER_CHANGE_NORMALIZE_FAILED', err);
    }
    refreshContainerBars();
    refreshLayoutTree();
    if (normalized && typeof pushAndSave === 'function') {
      try {
        pushAndSave();
      } catch (err) {
        warnLayoutStructure('DESIGNER_CONTAINER_CHANGE_SAVE_FAILED', err);
      }
    }
  }

  return {
    refreshContainerBars,
    refreshLayoutTree,
    handleContainerChange
  };
}
