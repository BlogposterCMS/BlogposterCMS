const path = require('path');
const fs = require('fs');

const entry = {
  adminSearch: './public/assets/js/adminSearch.js',
  contentHeaderActions: './public/plainspace/dashboard/contentHeaderActions.js',
  firstInstallCheck: './public/assets/js/firstInstallCheck.js',
  icons: './public/assets/js/icons.js',
  login: './public/assets/js/login.js',
  meltdownEmitter: './public/assets/js/meltdownEmitter.js',
  pageDataLoader: './public/assets/js/pageDataLoader.js',
  pageRenderer: './public/plainspace/main/pageRenderer.js',
  install: './public/assets/js/install.js',
  sortable: './public/assets/js/sortable.min.js',
  tokenLoader: './public/assets/js/tokenLoader.js',
  topHeaderActions: './public/plainspace/dashboard/topHeaderActions.js',
  openExplorer: './public/assets/js/openExplorer.js',
  pageActions: './public/plainspace/dashboard/pageActions.js',
  fontsLoader: './public/assets/js/fontsLoader.js',
  customSelect: './public/assets/js/customSelect.js'
};

const appsDir = path.join(__dirname, 'apps');
if (fs.existsSync(appsDir)) {
  fs.readdirSync(appsDir, { withFileTypes: true }).forEach(dirent => {
    if (!dirent.isDirectory()) return;
    const manifestPath = path.join(appsDir, dirent.name, 'app.json');
    if (!fs.existsSync(manifestPath)) return;
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const rawEntry = String(manifest.entry || '').replace(/[^a-zA-Z0-9_\-\/\.]/g, '');
      const key = rawEntry ? path.basename(rawEntry).replace(/\.js$/i, '') : dirent.name;
      let rel = 'index.js';
      if (rawEntry) {
        if (rawEntry.endsWith('.js') || rawEntry.includes('/')) {
          rel = rawEntry.endsWith('.js') ? rawEntry : `${rawEntry}.js`;
        } else if (fs.existsSync(path.join(appsDir, dirent.name, `${rawEntry}.js`))) {
          rel = `${rawEntry}.js`;
        }
      }
      entry[key] = `./apps/${dirent.name}/${rel}`;
    } catch {
      // ignore invalid manifest
    }
  });
}

module.exports = {
  mode: 'production',
  entry,
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'public', 'build'),
    clean: true
  },
  resolve: {
    // Alias removed: Builder uses relative paths
  },
  devtool: 'source-map'
};
