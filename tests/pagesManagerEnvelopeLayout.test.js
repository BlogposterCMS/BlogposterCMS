const {
  _internals: { designLayoutForPage }
} = require('../mother/modules/pagesManager');

describe('Pages Manager public envelope layout selection', () => {
  it('uses a linked Design Studio id before the slug layout fallback', () => {
    expect(designLayoutForPage({
      slug: 'coming-soon',
      meta: { designId: 42 }
    })).toEqual({
      layoutRef: 'layout:42@v1',
      hasLinkedDesign: true
    });
  });

  it('keeps an explicit design layout ref when one is stored on the page', () => {
    expect(designLayoutForPage({
      slug: 'landing',
      meta: JSON.stringify({ design_layout: 'layout:hero-page@v3' })
    })).toEqual({
      layoutRef: 'layout:hero-page@v3',
      hasLinkedDesign: true
    });
  });

  it('falls back to the slug layout ref for pages without a linked design', () => {
    expect(designLayoutForPage({
      slug: 'landing',
      meta: null
    })).toEqual({
      layoutRef: 'layout:landing@v1',
      hasLinkedDesign: false
    });
  });
});
