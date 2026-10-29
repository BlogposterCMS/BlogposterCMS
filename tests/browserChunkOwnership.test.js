const config = require('../webpack.config');
const { ownsBrowserFile } = require('../mother/modules/updater/coreModuleBrowserFiles');

test('host chunks are hashed while Designer retains signed package ownership', () => {
  const name = 'designer-app-028e42eb';
  const template = config.output.chunkFilename({ chunk: { name } });
  const file = template.replace('[name]', name);
  expect(ownsBrowserFile('designerManager', `public/build/${file}`)).toBe(true);
  expect(config.output.chunkFilename({ chunk: { name: undefined } })).toBe('[name].[contenthash:16].js');
  expect(config.output.filename).toBe('[name].js');
});
