void import(
  /* webpackChunkName: "designer-app" */
  '../app/designer.js'
).catch(err => {
  console.error('DESIGNER_BOOT_CHUNK_LOAD_FAILED: failed to boot Designer app', err);
});
