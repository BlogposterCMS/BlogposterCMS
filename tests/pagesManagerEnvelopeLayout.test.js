const {
  _internals: { designLayoutForPage }
} = require('../mother/modules/pagesManager');

describe('Pages Manager public envelope layout selection', () => {
  it('uses a linked Design Studio id', () => {
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

  it('does not invent a layout reference for pages without a linked design', () => {
    expect(designLayoutForPage({
      slug: 'landing',
      meta: null
    })).toEqual({
      layoutRef: undefined,
      hasLinkedDesign: false
    });
  });
});
