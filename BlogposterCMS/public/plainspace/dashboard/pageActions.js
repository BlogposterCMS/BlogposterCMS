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
      window.location.href = `/admin/app/plainspace/${pageId}?layer=1`;
    } else {
      window.location.reload();
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

export async function createNewLayout() {
  const layoutName = prompt('New layout name:');
  if (!layoutName) return;
  try {
    await window.meltdownEmit('saveLayoutTemplate', {
      jwt: window.ADMIN_TOKEN,
      moduleName: 'plainspace',
      moduleType: 'core',
      name: layoutName.trim(),
      lane: 'public',
      viewport: 'desktop',
      layout: [],
      previewPath: ''
    });
    window.location.href = `/admin/app/plainspace?layout=${encodeURIComponent(layoutName.trim())}`;
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

window.createNewPage = createNewPage;
window.createNewLayout = createNewLayout;
