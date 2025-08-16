const meltdownEmit = window.meltdownEmit;
const jwt = window.ADMIN_TOKEN;
const baseOptions = { moduleName: 'pagesManager', moduleType: 'core' };

export const pageService = {
  async getAll() {
    const res = await meltdownEmit('getPagesByLane', { ...baseOptions, jwt, lane: 'public' });
    return Array.isArray(res) ? res : (res?.data ?? []);
  },
  async create({ title, slug }) {
    return meltdownEmit('createPage', { ...baseOptions, jwt, title, slug, lane: 'public', status: 'published' });
  },
  async update(page, patch) {
    return meltdownEmit('updatePage', {
      ...baseOptions,
      jwt,
      pageId: page.id,
      slug: page.slug,
      status: page.status,
      seo_Image: page.seo_image,
      parent_id: page.parent_id,
      is_content: page.is_content,
      lane: page.lane,
      language: page.language,
      title: page.title,
      meta: page.meta,
      ...patch
    });
  },
  updateSlug(page, slug) {
    return this.update(page, { slug });
  },
  updateTitle(page, title) {
    return this.update(page, { title });
  },
  updateStatus(page, status) {
    return this.update(page, { status });
  },
  async setAsStart(id) {
    return meltdownEmit('setAsStart', { ...baseOptions, jwt, pageId: id });
  },
  async delete(id) {
    return meltdownEmit('deletePage', { ...baseOptions, jwt, pageId: id });
  }
};
