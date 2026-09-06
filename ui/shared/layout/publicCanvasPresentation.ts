/** Shared public canvas presentation: server shell and client use identical geometry. */
export const PUBLIC_CANVAS_STYLE_ID = 'bp-public-canvas-runtime-style';
export const PUBLIC_CANVAS_CSS = `.bp-public-canvas {
  box-sizing: border-box;
  width: 100%;
  margin: 0;
  overflow: visible;
  contain: none;
  background: var(--studio-canvas, #fff);
  color: var(--studio-text, #1f2933);
}
.bp-public-canvas,
.bp-public-canvas * {
  box-sizing: border-box;
}
.bp-public-canvas > .canvas-item {
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  overflow: visible;
  user-select: auto;
  -webkit-user-select: auto;
  backdrop-filter: none;
  transition: none;
}
.bp-public-canvas > .canvas-item::before,
.bp-public-canvas .resize-handle,
.bp-public-canvas .bounding-box {
  display: none !important;
}
.bp-public-canvas .widget {
  width: 100%;
  height: 100%;
  min-height: 100%;
}
@media (max-width: 760px) {
  .bp-public-canvas {
    display: grid;
    gap: 16px;
    height: auto !important;
    min-height: auto !important;
    padding: 24px !important;
  }
  .bp-public-canvas > .canvas-item {
    position: relative !important;
    left: auto !important;
    top: auto !important;
    width: 100% !important;
    height: auto !important;
    min-height: 0 !important;
    transform: none !important;
  }
  .bp-public-canvas .widget {
    height: auto;
    min-height: 0;
  }
}`;

type Placement = { xPercent?: unknown; yPercent?: unknown; wPercent?: unknown; hPercent?: unknown; zIndex?: unknown; opacity?: unknown; rotationDeg?: unknown };
export function boundedPercent(value: unknown, fallback: number, max = 100): number {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? Math.min(max, Math.max(0, num)) : fallback;
}
export function publicPlacement(item: Placement) {
  return {
    x: boundedPercent(item.xPercent, 0), y: boundedPercent(item.yPercent, 0, 400),
    w: boundedPercent(item.wPercent, 100), h: boundedPercent(item.hPercent, 0, 400)
  };
}
export function publicItemStyle(item: Placement): Record<string, string> {
  const { x, y, w, h } = publicPlacement(item);
  const style: Record<string, string> = {
    position: 'absolute', left: `${x}%`, top: `${y}%`, width: `${Math.max(1, w)}%`,
    height: h > 0 ? `${h}%` : 'auto', transform: ''
  };
  if (Number.isFinite(Number(item.zIndex))) style['z-index'] = String(Number(item.zIndex));
  if (Number.isFinite(Number(item.opacity))) style.opacity = String(Number(item.opacity));
  const rotation = Number(item.rotationDeg);
  if (Number.isFinite(rotation) && rotation !== 0) style.transform = `rotate(${rotation}deg)`;
  return style;
}
export function publicCanvasStyle(layout: { items?: Placement[] }): Record<string, string> {
  const extent = (layout.items || []).reduce((max, item) => {
    const { y, h } = publicPlacement(item);
    return Math.max(max, y + h);
  }, 100);
  const height = `${Math.min(400, Math.max(100, Math.ceil(extent)))}vh`;
  return {
    width: '100%', 'min-height': height, height, position: 'relative', overflow: 'visible',
    '--studio-canvas': '#ffffff', '--studio-surface-solid': '#ffffff',
    '--studio-surface-muted': '#f6f7f8', '--studio-text': '#1f2933',
    '--studio-text-muted': 'rgba(31,41,51,.62)', '--studio-border': 'rgba(17,24,39,.08)',
    '--studio-border-strong': 'rgba(17,24,39,.14)', '--studio-radius-panel': '18px',
    '--studio-radius-control': '999px', '--studio-shadow-soft': '0 1px 2px rgba(0,0,0,.04), 0 14px 36px rgba(17,24,39,.08)'
  };
}
