/**
 * @jest-environment jsdom
 */

import {
  designUpdatedAt,
  designUrl,
  fetchDesignerLayouts,
  sortDesignsByRecent,
  toDesigns
} from '../ui/widgets/plainspace/admin/designerLayoutsData';

describe('designerLayoutsData', () => {
  it('normalizes and sorts design records', () => {
    const older = { id: 'old', updated_at: '2024-01-01T00:00:00.000Z' };
    const newer = { id: 'new', created_at: '2025-01-01T00:00:00.000Z' };

    expect(toDesigns({ designs: [older, null, 'bad', newer] })).toEqual([older, newer]);
    expect(sortDesignsByRecent([older, newer])).toEqual([newer, older]);
    expect(designUpdatedAt(newer)).toBe('2025-01-01T00:00:00.000Z');
  });

  it('builds stable designer URLs', () => {
    expect(designUrl({ id: 'layout 1' })).toBe('/admin/studio/design/layout%201');
    expect(designUrl({})).toBe('/admin/studio/design');
  });

  it('fetches layouts through the Designer module contract', async () => {
    const emit = jest.fn().mockResolvedValue({ designs: [{ id: 'd1' }] });

    await expect(fetchDesignerLayouts(emit, 'admin-token')).resolves.toEqual([{ id: 'd1' }]);
    expect(emit).toHaveBeenCalledWith('designer.listDesigns', {
      jwt: 'admin-token',
      moduleName: 'designer',
      moduleType: 'community'
    });
  });

  it('fails with a searchable error code when the emitter is missing', async () => {
    await expect(fetchDesignerLayouts(undefined as never, 'admin-token'))
      .rejects.toThrow('PLAINSPACE_DESIGNER_LAYOUTS_EMITTER_UNAVAILABLE');
  });
});
