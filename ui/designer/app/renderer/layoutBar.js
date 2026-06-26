function parseEffects(value) {
  if (!value) return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed)
      ? parsed.filter(effect => effect && typeof effect === 'object')
      : [];
  } catch {
    return [];
  }
}

const EFFECT_LABELS = {
  fadeIn: 'Fade In',
  fadeOut: 'Fade Out',
  moveY: 'Move'
};

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function clampPercent(value, fallback = 0) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed)
    ? Math.max(0, Math.min(100, parsed))
    : fallback;
}

function rangeProgress(progress, startValue, endValue) {
  const start = Number.parseFloat(startValue) || 0;
  const end = Number.parseFloat(endValue) || 100;
  const span = Math.max(1, end - start);
  return clamp01((progress - start) / span);
}

function normalizeBehavior(value) {
  const behavior = String(value || 'scroll')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return ['scroll', 'sticky', 'pinned'].includes(behavior) ? behavior : 'scroll';
}

function timelineRange(startValue, endValue) {
  const a = clampPercent(startValue, 0);
  const b = clampPercent(endValue, 100);
  const start = Math.min(a, b);
  const end = Math.max(a, b);
  return end > start ? { start, end } : { start: Math.max(0, start - 1), end: Math.min(100, end + 1) };
}

function behaviorLabel(behavior) {
  if (behavior === 'sticky') return 'Sticky';
  if (behavior === 'pinned') return 'Pinned';
  return 'Scroll';
}

function effectLabel(effect) {
  return EFFECT_LABELS[effect?.id] || effect?.title || effect?.id || 'Effect';
}

function itemLabel(item) {
  return item.dataset.elementName || item.dataset.sceneTitle || item.dataset.widgetId || 'Element';
}

function progressIsInRange(progress, startValue, endValue) {
  const start = Number.parseFloat(startValue) || 0;
  const end = Number.parseFloat(endValue) || 100;
  return progress >= Math.min(start, end) && progress <= Math.max(start, end);
}

function behaviorPreviewOffset(item, progress) {
  const behavior = normalizeBehavior(item.dataset.behavior);
  if (behavior === 'scroll') {
    delete item.dataset.behaviorState;
    return 0;
  }
  const active = progressIsInRange(progress, item.dataset.scrollStart, item.dataset.scrollEnd);
  item.dataset.behaviorState = active ? 'active' : 'idle';
  if (!active) return 0;
  const t = rangeProgress(progress, item.dataset.scrollStart, item.dataset.scrollEnd);
  const ease = Math.sin(t * Math.PI);
  return behavior === 'pinned'
    ? -28 * Math.max(0.35, ease)
    : -18 * Math.max(0.3, ease);
}

function effectDistance(effect) {
  const distance = Number.parseFloat(effect.distance);
  return Number.isFinite(distance) ? distance : 24;
}

function syncStagePreviewMarker(progress) {
  const guide = document.querySelector('.scene-viewport-guides');
  if (!guide) return;
  const pct = Math.round(clampPercent(progress, 0));
  let marker = guide.querySelector('.scene-preview-marker');
  if (!marker) {
    marker = document.createElement('div');
    marker.className = 'scene-preview-marker';
    marker.setAttribute('aria-hidden', 'true');
    marker.innerHTML = '<span></span>';
    guide.appendChild(marker);
  }
  marker.dataset.previewProgress = String(pct);
  marker.style.setProperty('--scene-preview-progress', `${pct}%`);
  const label = marker.querySelector('span');
  if (label) label.textContent = `${pct}%`;
}

function collectTimelineLanes(gridEl) {
  if (!gridEl) return [];
  const lanes = [];
  gridEl.querySelectorAll('.canvas-item').forEach(item => {
    const label = itemLabel(item);
    const behavior = normalizeBehavior(item.dataset.behavior);
    if (behavior !== 'scroll') {
      const range = timelineRange(item.dataset.scrollStart, item.dataset.scrollEnd);
      lanes.push({
        kind: 'behavior',
        label: behaviorLabel(behavior),
        detail: label,
        start: range.start,
        end: range.end
      });
    }
    parseEffects(item.dataset.effects)
      .filter(effect => effect.enabled !== false)
      .forEach(effect => {
        const range = timelineRange(effect.start, effect.end);
        lanes.push({
          kind: 'effect',
          label: effectLabel(effect),
          detail: label,
          start: range.start,
          end: range.end
        });
      });
  });
  return lanes.slice(0, 8);
}

function syncTimelineLaneActive(laneEl, progress) {
  const start = Number.parseFloat(laneEl.dataset.rangeStart) || 0;
  const end = Number.parseFloat(laneEl.dataset.rangeEnd) || 100;
  laneEl.classList.toggle('active', progressIsInRange(progress, start, end));
}

function syncTimelineLanes(laneWrap, progress) {
  laneWrap?.querySelectorAll?.('.scene-timeline-lane').forEach(lane => {
    syncTimelineLaneActive(lane, progress);
  });
}

function renderTimelineLanes(gridEl, laneWrap, progress) {
  if (!laneWrap) return;
  const lanes = collectTimelineLanes(gridEl);
  laneWrap.hidden = lanes.length === 0;
  laneWrap.innerHTML = '';
  lanes.forEach(lane => {
    const laneEl = document.createElement('span');
    laneEl.className = `scene-timeline-lane scene-timeline-lane--${lane.kind}`;
    laneEl.dataset.rangeStart = String(lane.start);
    laneEl.dataset.rangeEnd = String(lane.end);
    laneEl.style.setProperty('--scene-range-start', `${lane.start}%`);
    laneEl.style.setProperty('--scene-range-end', `${lane.end}%`);
    const copy = document.createElement('span');
    copy.className = 'scene-timeline-lane-copy';
    const label = document.createElement('strong');
    label.textContent = lane.label;
    const detail = document.createElement('small');
    detail.textContent = `${lane.detail} ${Math.round(lane.start)}-${Math.round(lane.end)}%`;
    copy.append(label, detail);
    laneEl.appendChild(copy);
    syncTimelineLaneActive(laneEl, progress);
    laneWrap.appendChild(laneEl);
  });
}

function applyEffectPreview(gridEl, progress) {
  syncStagePreviewMarker(progress);
  if (!gridEl) return;
  gridEl.querySelectorAll('.canvas-item').forEach(item => {
    const effects = parseEffects(item.dataset.effects);
    const behavior = normalizeBehavior(item.dataset.behavior);
    if (!effects.length && behavior === 'scroll') return;
    let opacity = 1;
    let translateY = behaviorPreviewOffset(item, progress);
    effects.forEach(effect => {
      if (effect.enabled === false) return;
      const t = rangeProgress(progress, effect.start, effect.end);
      if (effect.id === 'fadeIn') opacity *= t;
      if (effect.id === 'fadeOut') opacity *= (1 - t);
      if (effect.id === 'moveY') translateY += (1 - t) * effectDistance(effect);
    });
    const content = item.querySelector(':scope > .canvas-item-content');
    if (!content) return;
    content.style.opacity = String(Number(opacity.toFixed(3)));
    content.style.transform = translateY
      ? `translate3d(0, ${Number(translateY.toFixed(2))}px, 0)`
      : '';
    content.style.transition = 'opacity 120ms linear, transform 120ms linear';
    content.style.willChange = 'opacity, transform';
    item.dataset.effectProgress = String(Math.round(progress));
  });
}

export function buildLayoutBar({ footer, grid, gridEl }) {
  const layoutBar = document.createElement('div');
  layoutBar.className = 'layout-bar';

  const timeline = document.createElement('div');
  timeline.className = 'scene-timeline';

  const timelineLabel = document.createElement('span');
  timelineLabel.className = 'scene-timeline-label';
  timelineLabel.textContent = 'Scroll timeline';

  const playBtn = document.createElement('button');
  playBtn.type = 'button';
  playBtn.className = 'scene-timeline-play';
  playBtn.title = 'Play scroll preview';
  playBtn.innerHTML = window.featherIcon ? window.featherIcon('play') : '<img src="/assets/icons/play.svg" alt="Play" />';

  const timeStart = document.createElement('span');
  timeStart.className = 'scene-timeline-time';
  timeStart.textContent = '00';

  const progressWrap = document.createElement('div');
  progressWrap.className = 'scene-timeline-progress';
  progressWrap.innerHTML = `
    <div class="scene-timeline-ticks" aria-hidden="true">
      <span>0%</span>
      <span>25%</span>
      <span>50%</span>
      <span>75%</span>
      <span>100%</span>
    </div>
  `;
  const progress = document.createElement('input');
  progress.type = 'range';
  progress.min = '0';
  progress.max = '100';
  progress.value = '50';
  progress.setAttribute('aria-label', 'Scroll progress');
  progress.className = 'scene-timeline-range';
  progressWrap.appendChild(progress);
  const laneWrap = document.createElement('div');
  laneWrap.className = 'scene-timeline-lanes';
  progressWrap.appendChild(laneWrap);

  const timeEnd = document.createElement('span');
  timeEnd.className = 'scene-timeline-time scene-timeline-time--end';
  timeEnd.textContent = '100 %';

  timeline.appendChild(timelineLabel);
  timeline.appendChild(playBtn);
  timeline.appendChild(timeStart);
  timeline.appendChild(progressWrap);
  timeline.appendChild(timeEnd);

  const zoomWrap = document.createElement('div');
  zoomWrap.className = 'zoom-controls';
  const zoomOut = document.createElement('button');
  zoomOut.title = 'Zoom out';
  zoomOut.innerHTML = window.featherIcon ? window.featherIcon('minus') : '<img src="/assets/icons/zoom-out.svg" alt="-" />';
  const zoomLevel = document.createElement('span');
  zoomLevel.className = 'zoom-level';
  const zoomSlider = document.createElement('input');
  zoomSlider.type = 'range';
  zoomSlider.min = '10';
  zoomSlider.max = '500';
  zoomSlider.step = '1';
  zoomSlider.value = '100';
  zoomSlider.style.width = '180px';
  const zoomIn = document.createElement('button');
  zoomIn.title = 'Zoom in';
  zoomIn.innerHTML = window.featherIcon ? window.featherIcon('plus') : '<img src="/assets/icons/zoom-in.svg" alt="+" />';

  let zoomPct = 100;
  let playRaf = 0;
  let playStartedAt = 0;
  function applyZoom(pct) {
    zoomPct = Math.max(10, Math.min(500, Math.round(pct)));
    zoomSlider.value = String(zoomPct);
    zoomLevel.textContent = `${zoomPct}%`;
    const scale = zoomPct / 100;
    if (grid && typeof grid.setScale === 'function') {
      grid.setScale(scale);
    } else if (gridEl) {
      gridEl.style.transformOrigin = 'center center';
      gridEl.style.transform = `scale(${scale})`;
      gridEl.style.setProperty('--canvas-scale', String(scale));
      gridEl.dispatchEvent(new Event('zoom', { bubbles: true }));
    }
  }

  applyZoom(100);
  const initialProgress = Number.parseInt(progress.value, 10) || 50;
  applyEffectPreview(gridEl, initialProgress);
  renderTimelineLanes(gridEl, laneWrap, initialProgress);

  zoomOut.addEventListener('click', () => applyZoom(zoomPct - 10));
  zoomIn.addEventListener('click', () => applyZoom(zoomPct + 10));
  zoomSlider.addEventListener('input', () => applyZoom(parseInt(zoomSlider.value, 10) || 100));
  progress.addEventListener('input', () => {
    const pct = Number.parseInt(progress.value, 10) || 0;
    applyEffectPreview(gridEl, pct);
    syncTimelineLanes(laneWrap, pct);
  });
  grid?.on?.('change', () => renderTimelineLanes(gridEl, laneWrap, Number.parseInt(progress.value, 10) || 0));
  document.addEventListener('designerContentChanged', () => {
    renderTimelineLanes(gridEl, laneWrap, Number.parseInt(progress.value, 10) || 0);
  });
  playBtn.addEventListener('click', () => {
    if (playRaf) {
      cancelAnimationFrame(playRaf);
      playRaf = 0;
      return;
    }
    playStartedAt = performance.now();
    const duration = 3200;
    const tick = now => {
      const pct = Math.min(100, ((now - playStartedAt) / duration) * 100);
      progress.value = String(Math.round(pct));
      applyEffectPreview(gridEl, pct);
      syncTimelineLanes(laneWrap, pct);
      if (pct < 100) {
        playRaf = requestAnimationFrame(tick);
      } else {
        playRaf = 0;
      }
    };
    progress.value = '0';
    applyEffectPreview(gridEl, 0);
    syncTimelineLanes(laneWrap, 0);
    playRaf = requestAnimationFrame(tick);
  });

  gridEl.addEventListener('zoom', () => {
    const sc = parseFloat(getComputedStyle(gridEl).getPropertyValue('--canvas-scale') || '1');
    const pct = Math.round(sc * 100);
    zoomPct = pct;
    zoomSlider.value = String(pct);
    zoomLevel.textContent = `${pct}%`;
  });

  zoomWrap.appendChild(zoomOut);
  zoomWrap.appendChild(zoomSlider);
  zoomWrap.appendChild(zoomLevel);
  zoomWrap.appendChild(zoomIn);
  layoutBar.appendChild(timeline);
  layoutBar.appendChild(zoomWrap);

  (footer || document.body).appendChild(layoutBar);
  return layoutBar;
}
