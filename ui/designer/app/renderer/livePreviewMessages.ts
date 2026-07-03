export const DESIGNER_LIVE_PREVIEW_READY = 'designer-live-preview-ready';
export const DESIGNER_LIVE_PREVIEW_RENDER = 'designer-live-preview-render';
export const DESIGNER_LIVE_PREVIEW_RENDERED = 'designer-live-preview-rendered';
export const DESIGNER_LIVE_PREVIEW_FAILED = 'designer-live-preview-failed';
export const DESIGNER_LIVE_PREVIEW_RUNTIME_REQUEST = 'designer-live-preview-runtime-request';
export const DESIGNER_LIVE_PREVIEW_RUNTIME_RESPONSE = 'designer-live-preview-runtime-response';

export type DesignerLivePreviewViewport = {
  id: string;
  label: string;
  width: string;
};

export type DesignerLivePreviewPayload = {
  version: 1;
  title: string;
  lane: 'public';
  generatedAt: string;
  activeLayer: number;
  activeTheme: string;
  viewport: DesignerLivePreviewViewport;
  design: Record<string, unknown>;
  document: {
    version: 1;
    layoutTree: unknown;
    placements: unknown[];
    scenes: unknown[];
    styles: Record<string, unknown>;
    metadata: Record<string, unknown>;
  };
  widgets: unknown[];
  globalLayout: unknown[];
};
