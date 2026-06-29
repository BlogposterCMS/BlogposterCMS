import {
  resolveRuntimePresentationCascade
} from '../ui/runtime/main/runtimePresentationCascade';
import { fetchRuntimePageById } from '../ui/runtime/main/runtimePageData';

jest.mock('../ui/runtime/main/runtimePageData', () => ({
  fetchRuntimePageById: jest.fn()
}));

describe('runtimePresentationCascade', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetchRuntimePageById as jest.Mock).mockResolvedValue(null);
  });

  it('uses local page presentation before walking parent pages', async () => {
    const emit = jest.fn();

    const result = await resolveRuntimePresentationCascade(
      { id: 'page', parentId: 'parent', meta: { designId: 'local-design' } },
      emit,
      'public'
    );

    expect(result).toMatchObject({
      inherited: false,
      depth: 0,
      designId: 'local-design'
    });
    expect(fetchRuntimePageById).not.toHaveBeenCalled();
  });

  it('walks to the nearest ancestor layout template', async () => {
    const emit = jest.fn();
    (fetchRuntimePageById as jest.Mock)
      .mockResolvedValueOnce({ id: 'parent', parentId: 'collection', meta: {} })
      .mockResolvedValueOnce({ id: 'collection', parentId: null, meta: { layoutTemplate: 'product-template' } });

    const result = await resolveRuntimePresentationCascade(
      { id: 'product', parentId: 'parent', meta: {} },
      emit,
      'public'
    );

    expect(fetchRuntimePageById).toHaveBeenNthCalledWith(1, emit, 'parent', 'public');
    expect(fetchRuntimePageById).toHaveBeenNthCalledWith(2, emit, 'collection', 'public');
    expect(result).toMatchObject({
      inherited: true,
      depth: 2,
      layoutTemplate: 'product-template'
    });
  });

  it('does not walk parents when page presentation inheritance is disabled', async () => {
    const emit = jest.fn();

    const result = await resolveRuntimePresentationCascade(
      { id: 'page', parentId: 'parent', meta: { inheritParentDesign: false } },
      emit,
      'public'
    );

    expect(result).toBeNull();
    expect(fetchRuntimePageById).not.toHaveBeenCalled();
  });
});
