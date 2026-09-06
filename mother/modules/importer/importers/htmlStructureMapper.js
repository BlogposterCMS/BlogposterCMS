'use strict';

/** Build only the existing Section -> Container LayoutTree, retaining source ownership. */
function buildHtmlStructure(snapshots, rootId, ranges) {
  if (!snapshots.some(s => s.structure?.sections?.length)) return null;
  const error = message => { throw new Error(`[HTML_IMPORT_STRUCTURE_INVALID] ${message}`); };
  const variants = new Map();
  const elementOwners = new Map();
  const frames = snapshots.map((snapshot, index) => {
    const sections = snapshot.structure?.sections;
    const containers = snapshot.structure?.containers;
    if (!Array.isArray(sections) || !sections.length || !Array.isArray(containers)
      || sections.length + containers.length > 500) error('Expected bounded sections and containers at every captured width.');
    const nodes = new Map();
    for (const item of [...sections.map(s => ({ ...s, isSection: true })), ...containers.map(c => ({ ...c, isSection: false }))]) {
      if (!/^[a-z0-9-]{1,100}$/i.test(item.id || '') || nodes.has(item.id)) error('Duplicate or invalid container ID.');
      if (![item.rect?.x, item.rect?.y, item.rect?.w, item.rect?.h].every(Number.isFinite)
        || item.rect.w <= 0 || item.rect.h <= 0 || Object.values(item.rect).some(n => Math.abs(n) > 200000)) error('Invalid container bounds.');
      nodes.set(item.id, item);
      if (!variants.has(item.id)) variants.set(item.id, new Map());
      variants.get(item.id).set(index, item);
    }
    for (const item of nodes.values()) {
      if (item.isSection) continue;
      if (!nodes.get(item.sectionId)?.isSection) error('Container section is missing.');
      const visited = new Set([item.id]);
      let ancestor = nodes.get(item.parentId);
      while (ancestor && !ancestor.isSection) {
        if (visited.has(ancestor.id)) error('Cyclic container hierarchy.');
        visited.add(ancestor.id);
        ancestor = nodes.get(ancestor.parentId);
      }
      if (!ancestor || ancestor.id !== item.sectionId) error('Container parent belongs to another section.');
    }
    for (const item of snapshot.elements) {
      if (!nodes.has(item.parentId) || !nodes.get(item.sectionId)?.isSection) error('Element container is missing.');
      const parent = nodes.get(item.parentId);
      if ((parent.isSection ? parent.id : parent.sectionId) !== item.sectionId) error('Element and container sections disagree.');
      const owner = `${item.parentId}:${item.sectionId}`;
      if (elementOwners.has(item.id) && elementOwners.get(item.id) !== owner) error('Element ownership changes between widths.');
      elementOwners.set(item.id, owner);
    }
    return nodes;
  });
  if (variants.size > 500) error('Combined structure exceeds 500 nodes.');
  const idFor = id => `${rootId}-${id}`;
  const paintNodes = new Map();
  snapshots.forEach(snapshot => [...snapshot.elements, ...snapshot.structure.containers].forEach(item => paintNodes.set(item.id, item)));
  const paintIds = [...paintNodes.keys()].sort((a, b) => (Number(paintNodes.get(a).stackingOrder) || 0) - (Number(paintNodes.get(b).stackingOrder) || 0)
    || Number(a.match(/\d+/)?.[0] || 0) - Number(b.match(/\d+/)?.[0] || 0));
  const stackOrder = id => paintIds.indexOf(id) + 1;
  const latest = id => [...variants.get(id).values()].at(-1);
  // Reparenting across breakpoints cannot be expressed by a single canonical LayoutTree.
  for (const values of variants.values()) {
    const owners = new Set([...values.values()].map(v => `${v.parentId || ''}:${v.sectionId || ''}:${Boolean(v.isSection)}`));
    if (owners.size !== 1) error('Container ownership changes between widths.');
  }
  function placement(item, index) {
    const parent = frames[index].get(item.parentId);
    return { centerXPercent: (item.rect.x - parent.rect.x + item.rect.w / 2) / parent.rect.w * 100,
      yPx: Math.max(0, item.rect.y - parent.rect.y), widthPx: item.rect.w, heightPx: item.rect.h,
      minWidthPx: 1, minHeightPx: 1 };
  }
  function nodeFor(sourceId) {
    const item = latest(sourceId);
    const values = variants.get(sourceId);
    const childIds = [...variants.keys()].filter(id => latest(id).parentId === sourceId);
    const node = { type: childIds.length ? 'split' : 'leaf', nodeId: idFor(sourceId), workarea: true,
      settings: { mode: 'free', minHeight: item.isSection ? '320px' : '1px', overflow: 'visible' } };
    if (childIds.length) Object.assign(node, { orientation: 'vertical', children: childIds.map(nodeFor) });
    if (item.isSection) node.section = { id: node.nodeId, title: String(item.title || 'Imported section').slice(0, 100) };
    else {
      const entries = [...values.entries()];
      const [baseIndex, baseItem] = entries.at(-1);
      const baseGeometry = placement(baseItem, baseIndex);
      node.placement = { zIndex: stackOrder(sourceId), responsivePlacement: { version: 1, base: baseGeometry,
        rules: entries.map(([index, variant]) => ({ id: `capture-${snapshots[index].viewport.width}`, ...ranges[index], geometry: placement(variant, index) })) } };
    }
    return node;
  }
  const sections = [...variants.keys()].filter(id => latest(id).isSection);
  // The page must shrink with its Sections rather than inherit the previous zoom sizer height.
  const layout = { type: 'split', nodeId: 'page-root', orientation: 'vertical', settings: { mode: 'stack', minHeight: '0px' }, children: sections.map(nodeFor) };
  return {
    layout, stackOrder, sectionCount: sections.length, containerCount: variants.size - sections.length,
    parentId: el => idFor(el.parentId), sceneId: el => idFor(el.sectionId),
    title: el => String(latest(el.sectionId).title || 'Imported section'),
    relativeElement(el, index) {
      const parent = frames[index].get(el.parentId);
      return { ...el, rect: { ...el.rect, x: el.rect.x - parent.rect.x, y: Math.max(0, el.rect.y - parent.rect.y) }, parentWidth: parent.rect.w };
    },
    page(el) {
      return { rootId: idFor(el.sectionId), containerRootId: 'page-root', containerName: `bp-import-${rootId.slice('html-import-'.length)}`,
        initialMinHeight: '320px', frames: frames.flatMap((nodes, index) => {
          const section = nodes.get(el.sectionId);
          return section ? [{ ...ranges[index], height: section.rect.h }] : [];
        }) };
    }
  };
}

module.exports = { buildHtmlStructure };
