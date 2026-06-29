import {
  createDesignDocument,
  extractDesignDocument,
  normalizeLayoutContainerSettings,
  normalizeLayoutTree
} from '../ui/shared/layout/layoutDocument';

describe('shared layout document contract', () => {
  it('normalizes legacy layout trees into explicit nodes', () => {
    expect(normalizeLayoutTree({
      orientation: 'horizontal',
      node_id: 10,
      scenes: [{ id: 'hero', title: 'Hero', bg_color: '#ffffff' }],
      children: [
        { nodeId: 'left', design_ref: 'static-design' },
        { nodeId: 'right', isDynamicHost: true }
      ]
    })).toEqual({
      type: 'split',
      orientation: 'horizontal',
      nodeId: '10',
      scenes: [{ id: 'hero', title: 'Hero', background: '#ffffff' }],
      children: [
        { type: 'leaf', nodeId: 'left', designRef: 'static-design' },
        { type: 'leaf', workarea: true, nodeId: 'right' }
      ]
    });
  });

  it('normalizes safe container settings and drops unsafe style values', () => {
    expect(normalizeLayoutContainerSettings({
      layoutMode: 'row',
      gap: 12,
      padding: '24px',
      background: '#f8fafc',
      maxWidth: '1200px',
      minHeight: '50vh',
      overflow: 'hidden',
      bad: 'ignored',
      backgroundColor: 'url(javascript:alert(1))'
    })).toEqual({
      mode: 'row',
      gap: '12px',
      padding: '24px',
      background: '#f8fafc',
      maxWidth: '1200px',
      minHeight: '50vh',
      overflow: 'hidden'
    });
  });

  it('normalizes reusable style source metadata on containers', () => {
    expect(normalizeLayoutTree({
      type: 'split',
      orientation: 'vertical',
      nodeId: 'root',
      children: [
        {
          type: 'leaf',
          nodeId: 'leader',
          styleSource: {
            enabled: 'true',
            role: 'source',
            syncLayout: 'true',
            syncDesign: 'true'
          }
        },
        {
          type: 'leaf',
          nodeId: 'follower',
          style_source: {
            enabled: true,
            role: 'follower',
            source_id: 'leader',
            sync_layout: false,
            sync_design: true
          }
        }
      ]
    })).toMatchObject({
      children: [
        {
          nodeId: 'leader',
          styleSource: {
            enabled: true,
            role: 'source',
            syncLayout: true,
            syncDesign: true
          }
        },
        {
          nodeId: 'follower',
          styleSource: {
            enabled: true,
            role: 'follower',
            sourceId: 'leader',
            syncLayout: false,
            syncDesign: true
          }
        }
      ]
    });
  });

  it('extracts a design document from the current designer response shape', () => {
    const doc = extractDesignDocument({
      design: {
        layout_json: JSON.stringify({ type: 'leaf', nodeId: 'main', workarea: true })
      },
      widgets: [{
        instanceId: 'w1',
        widgetId: 'textBox',
        style_source: {
          enabled: true,
          role: 'follower',
          sourceId: 'w0'
        }
      }]
    });

    expect(doc.layoutTree).toEqual({ type: 'leaf', workarea: true, nodeId: 'main' });
    expect(doc.placements).toEqual([{
      instanceId: 'w1',
      widgetId: 'textBox',
      styleSource: {
        enabled: true,
        role: 'follower',
        sourceId: 'w0'
      }
    }]);
    expect(doc.version).toBe(1);
  });

  it('creates empty documents with stable defaults', () => {
    expect(createDesignDocument()).toEqual({
      version: 1,
      layoutTree: null,
      placements: [],
      scenes: [],
      styles: {},
      metadata: {}
    });
  });
});
