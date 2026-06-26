import {
  createDesignDocument,
  extractDesignDocument,
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

  it('extracts a design document from the current designer response shape', () => {
    const doc = extractDesignDocument({
      design: {
        layout_json: JSON.stringify({ type: 'leaf', nodeId: 'main', workarea: true })
      },
      widgets: [{ instanceId: 'w1', widgetId: 'textBox' }]
    });

    expect(doc.layoutTree).toEqual({ type: 'leaf', workarea: true, nodeId: 'main' });
    expect(doc.placements).toEqual([{ instanceId: 'w1', widgetId: 'textBox' }]);
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
