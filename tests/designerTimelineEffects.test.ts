/** @jest-environment jsdom */

import { buildLayoutBar } from '../ui/designer/app/renderer/layoutBar';

describe('designer timeline effects preview', () => {
  it('applies configured fade and move effects from the timeline slider', () => {
    document.body.innerHTML = '';
    const footer = document.createElement('footer');
    const gridEl = document.createElement('div');
    const item = document.createElement('div');
    const content = document.createElement('div');

    gridEl.className = 'canvas-grid';
    item.className = 'canvas-item';
    item.dataset.effects = JSON.stringify([
      { id: 'fadeIn', enabled: true, start: 10, end: 30 },
      { id: 'moveY', enabled: true, start: 10, end: 50 }
    ]);
    content.className = 'canvas-item-content';
    item.appendChild(content);
    gridEl.appendChild(item);
    document.body.append(gridEl, footer);

    buildLayoutBar({ footer, grid: null, gridEl });

    const range = footer.querySelector<HTMLInputElement>('.scene-timeline-range')!;
    expect(content.style.opacity).toBe('1');
    expect(content.style.transform).toBe('');

    range.value = '0';
    range.dispatchEvent(new Event('input', { bubbles: true }));

    expect(content.style.opacity).toBe('0');
    expect(content.style.transform).toContain('24px');

    range.value = '50';
    range.dispatchEvent(new Event('input', { bubbles: true }));

    expect(content.style.opacity).toBe('1');
    expect(content.style.transform).toBe('');
  });

  it('previews sticky behavior across the active scroll range', () => {
    document.body.innerHTML = '';
    const footer = document.createElement('footer');
    const gridEl = document.createElement('div');
    const item = document.createElement('div');
    const content = document.createElement('div');

    item.className = 'canvas-item';
    item.dataset.behavior = 'sticky';
    item.dataset.scrollStart = '10';
    item.dataset.scrollEnd = '60';
    content.className = 'canvas-item-content';
    item.appendChild(content);
    gridEl.appendChild(item);
    document.body.append(gridEl, footer);

    buildLayoutBar({ footer, grid: null, gridEl });

    const range = footer.querySelector<HTMLInputElement>('.scene-timeline-range')!;
    range.value = '0';
    range.dispatchEvent(new Event('input', { bubbles: true }));

    expect(item.dataset.behaviorState).toBe('idle');
    expect(content.style.transform).toBe('');

    range.value = '30';
    range.dispatchEvent(new Event('input', { bubbles: true }));

    expect(item.dataset.behaviorState).toBe('active');
    expect(content.style.transform).toContain('translate3d');

    range.value = '90';
    range.dispatchEvent(new Event('input', { bubbles: true }));

    expect(item.dataset.behaviorState).toBe('idle');
    expect(content.style.transform).toBe('');
  });

  it('renders behavior and effect lanes on the scroll timeline', () => {
    document.body.innerHTML = '';
    const footer = document.createElement('footer');
    const gridEl = document.createElement('div');
    const item = document.createElement('div');
    const content = document.createElement('div');

    item.className = 'canvas-item';
    item.dataset.behavior = 'sticky';
    item.dataset.scrollStart = '10';
    item.dataset.scrollEnd = '60';
    item.dataset.elementName = 'Hero headline';
    item.dataset.effects = JSON.stringify([
      { id: 'fadeIn', enabled: true, start: 20, end: 40 }
    ]);
    content.className = 'canvas-item-content';
    item.appendChild(content);
    gridEl.appendChild(item);
    document.body.append(gridEl, footer);

    buildLayoutBar({ footer, grid: null, gridEl });

    const lanes = footer.querySelectorAll<HTMLElement>('.scene-timeline-lane');
    expect(lanes).toHaveLength(2);
    expect(lanes[0].classList.contains('scene-timeline-lane--behavior')).toBe(true);
    expect(lanes[0].style.getPropertyValue('--scene-range-start')).toBe('10%');
    expect(lanes[0].style.getPropertyValue('--scene-range-end')).toBe('60%');
    expect(lanes[1].classList.contains('scene-timeline-lane--effect')).toBe(true);
    expect(lanes[1].style.getPropertyValue('--scene-range-start')).toBe('20%');
    expect(lanes[1].textContent).toContain('Fade In');

    const range = footer.querySelector<HTMLInputElement>('.scene-timeline-range')!;
    range.value = '30';
    range.dispatchEvent(new Event('input', { bubbles: true }));

    expect(lanes[0].classList.contains('active')).toBe(true);
    expect(lanes[1].classList.contains('active')).toBe(true);
  });

  it('syncs a stage preview marker with the timeline progress', () => {
    document.body.innerHTML = '';
    const footer = document.createElement('footer');
    const guides = document.createElement('div');
    const gridEl = document.createElement('div');
    const item = document.createElement('div');
    const content = document.createElement('div');

    guides.className = 'scene-viewport-guides';
    item.className = 'canvas-item';
    content.className = 'canvas-item-content';
    item.appendChild(content);
    gridEl.appendChild(item);
    document.body.append(guides, gridEl, footer);

    buildLayoutBar({ footer, grid: null, gridEl });

    const marker = guides.querySelector<HTMLElement>('.scene-preview-marker')!;
    expect(marker).toBeTruthy();
    expect(marker.dataset.previewProgress).toBe('50');
    expect(marker.style.getPropertyValue('--scene-preview-progress')).toBe('50%');

    const range = footer.querySelector<HTMLInputElement>('.scene-timeline-range')!;
    range.value = '75';
    range.dispatchEvent(new Event('input', { bubbles: true }));

    expect(marker.dataset.previewProgress).toBe('75');
    expect(marker.style.getPropertyValue('--scene-preview-progress')).toBe('75%');
    expect(marker.textContent).toBe('75%');
  });
});
