/** @jest-environment jsdom */

import { planSectionDeletion } from '../ui/designer/app/managers/sectionDeletion';

describe('Design Studio Section deletion', () => {
  const sections = [
    { id: 'hero', title: 'Hero' },
    { id: 'features', title: 'Features' },
    { id: 'footer', title: 'Footer' }
  ];

  it('removes the Section and every placement in its recursive Container grids', () => {
    const result = planSectionDeletion({
      sections,
      sceneId: 'features',
      surfaceRecords: [
        { sectionId: 'hero', surfaceId: 'hero' },
        { sectionId: 'features', surfaceId: 'features' },
        { sectionId: 'features', surfaceId: 'feature-grid' },
        { sectionId: 'features', surfaceId: 'feature-card' },
        { sectionId: 'footer', surfaceId: 'footer' }
      ],
      layoutLayers: [
        {
          name: 'Layout',
          layout: [
            { id: 'hero-container', workareaId: 'hero', sceneId: 'hero' },
            { id: 'feature-container', workareaId: 'features', sceneId: 'features' },
            { id: 'nested-feature-container', workareaId: 'feature-grid' },
            { id: 'footer-container', workareaId: 'footer', sceneId: 'footer' }
          ]
        },
        {
          name: 'Design',
          layout: [
            { id: 'hero-title', workareaId: 'hero', sceneId: 'hero' },
            {
              id: 'feature-copy',
              workareaId: 'feature-card',
              code: { meta: { sceneId: 'features' } }
            },
            { id: 'footer-copy', workareaId: 'footer', sceneId: 'footer' }
          ]
        }
      ]
    });

    expect(result).toMatchObject({
      handled: true,
      removedSection: sections[1],
      fallbackSection: sections[2],
      remainingSections: [sections[0], sections[2]]
    });
    expect(result.removedSurfaceIds).toEqual([
      'features',
      'feature-grid',
      'feature-card'
    ]);
    expect(result.filteredLayerLayouts).toEqual([
      [
        { id: 'hero-container', workareaId: 'hero', sceneId: 'hero' },
        { id: 'footer-container', workareaId: 'footer', sceneId: 'footer' }
      ],
      [
        { id: 'hero-title', workareaId: 'hero', sceneId: 'hero' },
        { id: 'footer-copy', workareaId: 'footer', sceneId: 'footer' }
      ]
    ]);
  });

  it('keeps the last Section as the minimum valid page structure', () => {
    expect(planSectionDeletion({
      sections: [sections[0]],
      sceneId: 'hero'
    })).toEqual({
      handled: false,
      reason: 'last-section',
      code: 'DESIGNER_SECTION_DELETE_LAST_SECTION'
    });
  });

  it('reports an unknown Section without changing layouts', () => {
    expect(planSectionDeletion({
      sections,
      sceneId: 'missing'
    })).toEqual({
      handled: false,
      reason: 'section-not-found',
      code: 'DESIGNER_SECTION_DELETE_NOT_FOUND'
    });
  });
});
