export async function createNewPage() {
  const title = prompt('New page title:');
  if (!title) return;
  const slug = prompt('Slug (optional):') || '';
  try {
     const { pageId } = await window.meltdownEmit('createPage', {
      jwt: window.ADMIN_TOKEN,
      moduleName: 'pagesManager',
      moduleType: 'core',
      title,
      slug,
      lane: 'public',
      status: 'published'
    }) || {};

    if (pageId) {
      window.location.href = `/admin/builder?pageId=${pageId}&layer=1`;
    } else {
      window.location.reload();
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
  window.createNewPage = createNewPage;
}
