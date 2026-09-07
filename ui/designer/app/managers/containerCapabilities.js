/** Structural positioning limits for the existing canvas/public renderer. */
export function containerPositionAvailability(element, root) {
  const unavailable = reason => ({ available: false, reason });
  const fixed = unavailable('Fixed positioning is not supported for containers in the scaled canvas. Use a supported widget behavior instead.');
  if (!element || element === root || element.classList.contains('layout-section')) {
    return { normal: { available: true, reason: '' }, sticky: unavailable('Sticky requires a nested container with a taller parent area.'), fixed };
  }
  const parent = element.parentElement?.closest('.layout-container');
  let reason = '';
  if (!parent || parent.dataset.layoutMode === 'free') reason = 'Sticky requires an Auto or Grid parent; Free placement owns the coordinates.';
  else if (element.dataset.dynamicHost === 'true' || element.querySelector('[data-dynamic-host="true"]')) reason = 'The page-content area must remain in normal document flow.';
  else {
    for (let ancestor = parent; ancestor && ancestor !== root; ancestor = ancestor.parentElement?.closest('.layout-container')) {
      if (ancestor.dataset.layoutOverflow && ancestor.dataset.layoutOverflow !== 'visible') {
        reason = 'An ancestor clips or scrolls its content. Sticky would attach to that area instead of the page.';
        break;
      }
    }
    if (!reason && parent.clientHeight - parseFloat(getComputedStyle(parent).paddingTop || '0') - parseFloat(getComputedStyle(parent).paddingBottom || '0') <= element.offsetHeight + 1) {
      reason = 'The container fills its parent height, leaving no room for Sticky. Reduce its height first.';
    }
  }
  return { normal: { available: true, reason: '' }, sticky: { available: !reason, reason }, fixed };
}
