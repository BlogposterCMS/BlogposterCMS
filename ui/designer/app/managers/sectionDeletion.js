function layoutItemIdentity(item) {
  const meta = item?.code?.meta && typeof item.code.meta === 'object'
    ? item.code.meta
    : {};
  return {
    sceneId: String(item?.sceneId || meta.sceneId || '').trim(),
    workareaId: String(
      item?.workareaId ||
      item?.workarea_id ||
      meta.workareaId ||
      meta.workarea_id ||
      ''
    ).trim()
  };
}

/**
 * Plans one canonical Section deletion without mutating live Designer state.
 *
 * The recursive surface ids matter because widgets inside nested Containers
 * persist their immediate Container as workareaId rather than the Section id.
 */
export function planSectionDeletion({
  sections = [],
  sceneId = '',
  surfaceRecords = [],
  layoutLayers = []
} = {}) {
  const normalizedSceneId = String(sceneId || '').trim();
  if (sections.length <= 1) {
    return {
      handled: false,
      reason: 'last-section',
      code: 'DESIGNER_SECTION_DELETE_LAST_SECTION'
    };
  }

  const sectionIndex = sections.findIndex(section => section?.id === normalizedSceneId);
  if (sectionIndex < 0) {
    return {
      handled: false,
      reason: 'section-not-found',
      code: 'DESIGNER_SECTION_DELETE_NOT_FOUND'
    };
  }

  const removedSection = sections[sectionIndex];
  const fallbackSection = sections[sectionIndex + 1] || sections[sectionIndex - 1] || null;
  if (!fallbackSection) {
    return {
      handled: false,
      reason: 'fallback-section-missing',
      code: 'DESIGNER_SECTION_DELETE_FALLBACK_MISSING'
    };
  }

  const removedSurfaceIds = new Set([normalizedSceneId]);
  surfaceRecords.forEach(record => {
    if (String(record?.sectionId || '').trim() !== normalizedSceneId) return;
    const surfaceId = String(record?.surfaceId || '').trim();
    if (surfaceId) removedSurfaceIds.add(surfaceId);
  });

  const itemBelongsToRemovedSection = item => {
    const identity = layoutItemIdentity(item);
    return identity.sceneId === normalizedSceneId ||
      removedSurfaceIds.has(identity.workareaId);
  };

  return {
    handled: true,
    removedSection,
    fallbackSection,
    removedSurfaceIds: Array.from(removedSurfaceIds),
    remainingSections: sections.filter(section => section !== removedSection),
    filteredLayerLayouts: layoutLayers.map(layer => (
      (Array.isArray(layer?.layout) ? layer.layout : [])
        .filter(item => !itemBelongsToRemovedSection(item))
    ))
  };
}
