const GRID_SURFACE_CLASS = 'layout-grid-surface';
const GRID_CONTAINER_CLASS = 'layout-grid-container';

function safeIdPart(value) {
  return String(value || 'container')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'container';
}

function directLayoutContainers(element) {
  return element
    ? Array.from(element.children).filter(child => (
        child instanceof HTMLElement &&
        child.classList.contains('layout-container')
      ))
    : [];
}

function sectionIdForLayoutItem(item, fallbackSurfaceId = '') {
  const meta = item?.code?.meta && typeof item.code.meta === 'object'
    ? item.code.meta
    : {};
  return String(
    item?.workareaId ||
    item?.workarea_id ||
    meta.workareaId ||
    meta.workarea_id ||
    item?.sceneId ||
    meta.sceneId ||
    fallbackSurfaceId ||
    ''
  ).trim();
}

function stampSurfaceIdentity(item, surfaceId) {
  const code = item?.code && typeof item.code === 'object'
    ? { ...item.code }
    : item?.code;
  const meta = code?.meta && typeof code.meta === 'object'
    ? { ...code.meta, workareaId: surfaceId }
    : code
      ? { workareaId: surfaceId }
      : null;
  return {
    ...item,
    workareaId: surfaceId,
    ...(code ? { code: { ...code, ...(meta ? { meta } : {}) } } : {})
  };
}

function ensureContainerGeometry(container) {
  if (!container.dataset.x) container.dataset.x = '0';
  if (!container.dataset.y) container.dataset.y = '0';
  if (!container.hasAttribute('gs-w')) container.setAttribute('gs-w', '480');
  if (!container.hasAttribute('gs-h')) container.setAttribute('gs-h', '240');
  if (!container.hasAttribute('gs-min-w')) container.setAttribute('gs-min-w', '120');
  if (!container.hasAttribute('gs-min-h')) container.setAttribute('gs-min-h', '80');
}

/**
 * Maintains the recursive Design Studio grid tree:
 * page -> Section grid -> Container grid -> Container grid -> widgets.
 *
 * A Container is intentionally one DOM node with both roles: it is a
 * CanvasGrid item in its parent and the CanvasGrid surface for its children.
 */
export function createLayoutGridRegistry({
  layoutRoot,
  legacyWorkspace = null,
  createGrid
} = {}) {
  if (!layoutRoot || typeof createGrid !== 'function') {
    throw new Error(
      'DESIGNER_LAYOUT_GRID_REGISTRY_INVALID: layoutRoot and createGrid are required.'
    );
  }

  const records = new Map();
  let activeSurfaceId = '';
  let legacyAdopted = false;

  function directSections() {
    return Array.from(layoutRoot.children).filter(child => (
      child instanceof HTMLElement &&
      child.matches('.layout-section[data-section-id]')
    ));
  }

  function adoptLegacyWorkspace(firstSection) {
    if (legacyAdopted || !legacyWorkspace || !firstSection) return;
    legacyAdopted = true;
    if (legacyWorkspace !== firstSection) {
      Array.from(legacyWorkspace.childNodes).forEach(child => firstSection.appendChild(child));
      legacyWorkspace.remove();
    }
  }

  function configureSurface(surface, surfaceId, sectionId, parentRecord = null) {
    surface.classList.add('builder-grid', GRID_SURFACE_CLASS);
    surface.dataset.gridSurfaceId = surfaceId;
    surface.dataset.workareaId = surfaceId;
    surface.setAttribute('aria-label', `${surface.dataset.sectionTitle || surfaceId} canvas`);

    if (!surface.id) {
      surface.id = parentRecord ? `container-${safeIdPart(surfaceId)}` : `workspace-${safeIdPart(surfaceId)}`;
    }

    const previous = records.get(surfaceId);
    const grid = surface.__grid || previous?.grid || createGrid(surface, surfaceId, {
      isSection: !parentRecord,
      parentRecord
    });
    const record = {
      surfaceId,
      sectionId,
      section: parentRecord?.section || surface,
      surface,
      workspace: surface,
      grid,
      parentSurfaceId: parentRecord?.surfaceId || null,
      isSection: !parentRecord
    };
    records.set(surfaceId, record);

    if (parentRecord) {
      surface.classList.add('canvas-item', GRID_CONTAINER_CLASS);
      surface.dataset.instanceId = surface.dataset.instanceId || `container:${surfaceId}`;
      ensureContainerGeometry(surface);
      if (surface.dataset.parentGridRegistered !== parentRecord.surfaceId) {
        const previousParent = records.get(surface.dataset.parentGridRegistered);
        previousParent?.grid?.unregisterWidget?.(surface, { silent: true });
        parentRecord.grid.makeWidget?.(surface, { silent: true });
        surface.dataset.parentGridRegistered = parentRecord.surfaceId;
      }
    }
    return record;
  }

  function walkSurface(surface, sectionId, parentRecord, liveIds) {
    const surfaceId = String(
      surface.dataset.sectionId ||
      surface.dataset.nodeId ||
      surface.dataset.gridSurfaceId ||
      ''
    ).trim();
    if (!surfaceId) {
      throw new Error(
        'DESIGNER_LAYOUT_GRID_SURFACE_ID_MISSING: every Section and Container needs a stable id.'
      );
    }
    liveIds.add(surfaceId);
    const record = configureSurface(surface, surfaceId, sectionId, parentRecord);
    directLayoutContainers(surface).forEach(child => {
      if (child.classList.contains('layout-section')) return;
      walkSurface(child, sectionId, record, liveIds);
    });
  }

  function sync() {
    const sections = directSections();
    adoptLegacyWorkspace(sections[0]);
    const liveIds = new Set();
    sections.forEach(section => {
      const sectionId = String(section.dataset.sectionId || '').trim();
      if (sectionId) walkSurface(section, sectionId, null, liveIds);
    });
    Array.from(records.keys()).forEach(surfaceId => {
      if (!liveIds.has(surfaceId)) records.delete(surfaceId);
    });
    if (!records.has(activeSurfaceId)) {
      activeSurfaceId = sections[0]?.dataset.sectionId || '';
    }
    return orderedRecords();
  }

  function orderedRecords() {
    const ordered = [];
    const visit = surface => {
      const id = String(surface.dataset.gridSurfaceId || surface.dataset.sectionId || surface.dataset.nodeId || '');
      const record = records.get(id);
      if (record) ordered.push(record);
      directLayoutContainers(surface).forEach(visit);
    };
    directSections().forEach(visit);
    return ordered;
  }

  function sectionRecords() {
    return orderedRecords().filter(record => record.isSection);
  }

  function activate(surfaceId) {
    sync();
    const requested = String(surfaceId || '').trim();
    const record = records.get(requested) || sectionRecords()[0] || null;
    activeSurfaceId = record?.surfaceId || '';
    return record;
  }

  function active() {
    return activate(activeSurfaceId);
  }

  function forWorkspace(workspace) {
    if (!workspace) return null;
    sync();
    return orderedRecords().find(record => record.surface === workspace) || null;
  }

  function forSection(sectionId) {
    sync();
    return sectionRecords().find(record => record.sectionId === sectionId) || null;
  }

  function partition(layout, fallbackSurfaceId = '') {
    sync();
    const fallback = records.has(fallbackSurfaceId)
      ? fallbackSurfaceId
      : (activeSurfaceId || sectionRecords()[0]?.surfaceId || '');
    const groups = new Map(orderedRecords().map(record => [record.surfaceId, []]));
    const unassigned = [];
    (Array.isArray(layout) ? layout : []).forEach(item => {
      const requested = sectionIdForLayoutItem(item, fallback);
      const surfaceId = records.has(requested) ? requested : fallback;
      if (!surfaceId || !groups.has(surfaceId)) {
        unassigned.push(item);
        return;
      }
      groups.get(surfaceId).push(stampSurfaceIdentity(item, surfaceId));
    });
    return { groups, unassigned };
  }

  function serializeLayer(serializer, layer, codeMap) {
    if (typeof serializer !== 'function') return [];
    sync();
    return orderedRecords().flatMap(record => (
      serializer(record.surface, layer, codeMap)
        .map(item => stampSurfaceIdentity(item, record.surfaceId))
    ));
  }

  function clearWidgets() {
    sync();
    orderedRecords().forEach(record => {
      const widgets = Array.from(record.surface.children).filter(child => (
        child instanceof HTMLElement &&
        child.classList.contains('canvas-item') &&
        !child.classList.contains(GRID_CONTAINER_CLASS)
      ));
      widgets.forEach(widget => record.grid.removeWidget?.(widget, { silent: true }));
    });
  }

  return {
    sync,
    activate,
    active,
    forWorkspace,
    forSection,
    orderedRecords,
    sectionRecords,
    partition,
    serializeLayer,
    clearAll: clearWidgets
  };
}
