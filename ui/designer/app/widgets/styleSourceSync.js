export function widgetStyleSourceId(target = null) {
  return String(target?.dataset?.instanceId || '').trim();
}

export function markWidgetStyleSource(source) {
  if (!source) return;
  source.dataset.styleSourceEnabled = 'true';
  source.dataset.styleSourceRole = 'source';
  source.dataset.styleSyncLayout = 'true';
  source.dataset.styleSyncDesign = 'true';
  delete source.dataset.styleSourceId;
}

export function unlinkWidgetStyleSource(target) {
  if (!target) return;
  target.dataset.styleSourceEnabled = 'false';
}

export function copyWidgetStyleProperties(source, target) {
  if (!source || !target || source === target) return;
  const syncLayout = target.dataset.styleSyncLayout !== 'false';
  const syncDesign = target.dataset.styleSyncDesign !== 'false';

  if (syncLayout) {
    ['gs-w', 'gs-h'].forEach(attr => {
      const value = source.getAttribute(attr);
      if (value) target.setAttribute(attr, value);
      else target.removeAttribute(attr);
    });
  }

  if (!syncDesign) return;
  ['opacity', 'radius', 'effects'].forEach(key => {
    if (source.dataset[key]) target.dataset[key] = source.dataset[key];
    else delete target.dataset[key];
  });
  if (source.style.opacity) target.style.opacity = source.style.opacity;
  else target.style.removeProperty('opacity');

  const sourceContent = source.querySelector?.(':scope > .canvas-item-content');
  const targetContent = target.querySelector?.(':scope > .canvas-item-content');
  if (targetContent) {
    if (sourceContent?.style?.borderRadius) {
      targetContent.style.borderRadius = sourceContent.style.borderRadius;
    } else if (source.dataset.radius) {
      targetContent.style.borderRadius = `${source.dataset.radius}px`;
    } else {
      targetContent.style.removeProperty('border-radius');
    }
  }
}

export function followWidgetStyleSource(target, source) {
  const sourceId = widgetStyleSourceId(source);
  if (!target || !source || !sourceId) return false;
  markWidgetStyleSource(source);
  target.dataset.styleSourceEnabled = 'true';
  target.dataset.styleSourceRole = 'follower';
  target.dataset.styleSourceId = sourceId;
  target.dataset.styleSyncLayout = 'true';
  target.dataset.styleSyncDesign = 'true';
  copyWidgetStyleProperties(source, target);
  return true;
}

export function applyWidgetStyleSources(root, source, options = {}) {
  const sourceId = widgetStyleSourceId(source);
  const scope = root?.querySelectorAll ? root : source?.parentElement;
  if (!scope || !source || !sourceId || source.dataset.styleSourceEnabled === 'false') return 0;
  const followers = Array.from(scope.querySelectorAll('.canvas-item')).filter(target => (
    target !== source &&
    target.dataset.styleSourceEnabled !== 'false' &&
    target.dataset.styleSourceId === sourceId
  ));
  followers.forEach(target => {
    copyWidgetStyleProperties(source, target);
    options.onFollower?.(target, source);
  });
  return followers.length;
}
