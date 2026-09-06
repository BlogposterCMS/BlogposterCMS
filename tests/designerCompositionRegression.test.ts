/** @jest-environment jsdom */
import { deserializeLayout, serializeLayout, setDynamicHost, activatePageSection } from '../ui/shared/layout/layoutDom';
import { getRuntimeDesignDocument, renderRuntimeDesignDocument, getRuntimeDesignContentMount } from '../ui/runtime/main/runtimeDesignDocument';
import { fetchRuntimeDesign } from '../ui/runtime/main/runtimePageData';
import { renderStaticRuntimeGrid } from '../ui/runtime/main/runtimeStaticGrid';

jest.mock('../ui/runtime/main/runtimePageData', () => ({ fetchRuntimeDesign: jest.fn() }));
jest.mock('../ui/runtime/main/runtimeStaticGrid', () => ({ renderStaticRuntimeGrid: jest.fn() }));

const leaf = (nodeId: string, extra = {}) => ({ type: 'leaf', nodeId, ...extra });
const tree = (children: unknown[]) => ({ type: 'split', nodeId: 'root', orientation: 'vertical', children });

describe('Designer reusable composition', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('keeps the saved content host when the active scene changes and after reload', () => {
    const root = document.createElement('div');
    deserializeLayout(tree([
      leaf('header', { section: { id: 'header', title: 'Header' } }),
      leaf('content', { section: { id: 'content', title: 'Content' } })
    ]), root);
    setDynamicHost(root, root.querySelector('[data-node-id="content"]'));
    activatePageSection(root, 'header');
    const saved = serializeLayout(root);
    const reload = document.createElement('div');
    deserializeLayout(saved, reload);
    expect(reload.querySelector('[data-dynamic-host="true"]')?.getAttribute('data-node-id')).toBe('content');
    expect(reload.querySelector('[data-workarea="true"]')?.getAttribute('data-node-id')).toBe('header');
  });

  it('renders referenced designs structurally and allows the same design in siblings', async () => {
    (fetchRuntimeDesign as jest.Mock).mockResolvedValue({ design: { layout: tree([leaf('nested')]) }, widgets: [] });
    const target = document.createElement('main');
    await renderRuntimeDesignDocument(target, getRuntimeDesignDocument({ layoutTree: tree([
      leaf('left', { designRef: 'shared' }), leaf('right', { designRef: 'shared' })
    ]) }), [], 'public', { emit: jest.fn(), designPath: ['outer'] });
    expect(fetchRuntimeDesign).toHaveBeenCalledTimes(2);
    expect(target.querySelectorAll('[data-node-id="nested"]')).toHaveLength(2);
    expect(renderStaticRuntimeGrid).toHaveBeenCalled();
  });

  it('stops a circular reference without blocking the rest of the layout', async () => {
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (fetchRuntimeDesign as jest.Mock).mockResolvedValue({ design: { layout: leaf('back', { designRef: 'outer' }) } });
    const target = document.createElement('main');
    await renderRuntimeDesignDocument(target, getRuntimeDesignDocument({ layoutTree: leaf('entry', { designRef: 'inner' }) }), [], 'public', { emit: jest.fn(), designPath: ['outer'] });
    expect(fetchRuntimeDesign).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('RUNTIME_DESIGN_REF_CYCLE_OR_DEPTH'), 'outer');
    warning.mockRestore();
  });

  it('prefers the explicit outer content host over active and nested workareas', async () => {
    const target = document.createElement('main');
    await renderRuntimeDesignDocument(target, getRuntimeDesignDocument({ layoutTree: tree([
      leaf('header', { workarea: true }), leaf('content', { isDynamicHost: true }), leaf('footer')
    ]) }), [], 'public');
    expect(getRuntimeDesignContentMount(target).dataset.nodeId).toBe('content');
  });
});
