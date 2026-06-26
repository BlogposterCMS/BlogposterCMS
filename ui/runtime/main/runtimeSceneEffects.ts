import { normalizeEffects } from './sceneRuntime.js';

type LooseRecord = Record<string, any>;

function toNumberSafe(value: unknown, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  const num = typeof value === 'string' ? parseFloat(value) : Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function normalizeToken(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
}

const sceneEffectItems = new Set<HTMLElement>();
let sceneEffectRaf = 0;
let sceneEffectsBound = false;

function rangeProgress(progress: number, startValue: unknown, endValue: unknown): number {
  const start = toNumberSafe(startValue, 0);
  const end = toNumberSafe(endValue, 100);
  const span = Math.max(1, end - start);
  return clamp01((progress - start) / span);
}

function getViewportProgress(el: HTMLElement): number {
  const rect = el.getBoundingClientRect();
  const viewportH = window.innerHeight || document.documentElement.clientHeight || 1;
  const travel = Math.max(1, viewportH + rect.height);
  return Math.max(0, Math.min(100, ((viewportH - rect.top) / travel) * 100));
}

function normalizeSceneBehavior(value: unknown): string {
  const behavior = normalizeToken(value);
  return ['scroll', 'sticky', 'pinned'].includes(behavior) ? behavior : 'scroll';
}

function progressIsInRange(progress: number, startValue: unknown, endValue: unknown): boolean {
  const start = toNumberSafe(startValue, 0);
  const end = toNumberSafe(endValue, 100);
  return progress >= Math.min(start, end) && progress <= Math.max(start, end);
}

export function hasSceneMotion(el: HTMLElement): boolean {
  return normalizeEffects(el.dataset.effects).length > 0
    || normalizeSceneBehavior(el.dataset.behavior) !== 'scroll';
}

function getBehaviorTranslateY(el: HTMLElement, progress: number): number {
  const behavior = normalizeSceneBehavior(el.dataset.behavior);
  if (behavior === 'scroll') {
    delete el.dataset.behaviorState;
    return 0;
  }
  const active = progressIsInRange(progress, el.dataset.scrollStart, el.dataset.scrollEnd);
  el.dataset.behaviorState = active ? 'active' : 'idle';
  if (!active) return 0;
  const rect = el.getBoundingClientRect();
  const viewportH = window.innerHeight || document.documentElement.clientHeight || 1;
  const targetTop = behavior === 'pinned'
    ? (viewportH * 0.42) - (rect.height / 2)
    : Math.max(48, viewportH * 0.18);
  const offset = targetTop - rect.top;
  return Number.isFinite(offset) ? offset : 0;
}

function effectDistance(effect: LooseRecord): number {
  const distance = toNumberSafe(effect.distance, NaN);
  return Number.isFinite(distance) ? distance : 24;
}

function applyEffectProgress(el: HTMLElement, progress: number): void {
  const effects = normalizeEffects(el.dataset.effects);
  const behavior = normalizeSceneBehavior(el.dataset.behavior);
  if (!effects.length && behavior === 'scroll') return;
  let opacity = 1;
  let translateY = getBehaviorTranslateY(el, progress);
  for (const effect of effects) {
    if (effect.enabled === false) continue;
    const t = rangeProgress(progress, effect.start, effect.end);
    if (effect.id === 'fadeIn') opacity *= t;
    if (effect.id === 'fadeOut') opacity *= (1 - t);
    if (effect.id === 'moveY') translateY += (1 - t) * effectDistance(effect);
  }
  const target = el.querySelector<HTMLElement>(':scope > .canvas-item-content');
  if (!target) return;
  target.style.opacity = String(Number(opacity.toFixed(3)));
  target.style.transform = translateY
    ? `translate3d(0, ${Number(translateY.toFixed(2))}px, 0)`
    : '';
  target.style.transition = 'opacity 120ms linear, transform 120ms linear';
  target.style.willChange = 'opacity, transform';
  el.dataset.effectProgress = String(Math.round(progress));
}

function updateSceneEffects(): void {
  sceneEffectRaf = 0;
  sceneEffectItems.forEach(el => {
    if (!el.isConnected) {
      sceneEffectItems.delete(el);
      return;
    }
    applyEffectProgress(el, getViewportProgress(el));
  });
}

export function requestSceneEffectUpdate(): void {
  if (sceneEffectRaf) return;
  sceneEffectRaf = window.requestAnimationFrame(updateSceneEffects);
}

function ensureSceneEffectsBound(): void {
  if (sceneEffectsBound || typeof window === 'undefined') return;
  sceneEffectsBound = true;
  window.addEventListener('scroll', requestSceneEffectUpdate, { passive: true });
  window.addEventListener('resize', requestSceneEffectUpdate);
}

export function registerSceneEffects(wrapper: HTMLElement): void {
  if (!hasSceneMotion(wrapper)) return;
  sceneEffectItems.add(wrapper);
  ensureSceneEffectsBound();
  requestSceneEffectUpdate();
}
