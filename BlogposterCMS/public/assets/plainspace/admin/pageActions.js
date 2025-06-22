export async function createNewPage() {
  const title = prompt('New page title:');
  if (!title) return;
  const slug = prompt('Slug (optional):') || '';
  try {
    await window.meltdownEmit('createPage', {
      jwt: window.ADMIN_TOKEN,
      moduleName: 'pagesManager',
      moduleType: 'core',
      title,
      slug,
      lane: 'public',
      status: 'published'
    });
    window.location.reload();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}
