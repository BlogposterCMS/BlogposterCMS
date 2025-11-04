const path = require('path');
const fs = require('fs');

const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

function resolveSource(basePath, relativePath) {
  const normalized = relativePath.replace(/\\/g, '/');
  const hasExtension = EXTENSIONS.some(ext => normalized.endsWith(ext));
  if (hasExtension) {
    return normalized;
  }
  for (const ext of EXTENSIONS) {
    const candidate = `${normalized}${ext}`;
    if (fs.existsSync(path.join(basePath, candidate))) {
      return candidate;
    }
  }
  return `${normalized}.js`;
}

const entry = {
  adminSearch: resolveSource(__dirname, './public/assets/js/adminSearch'),
  contentHeaderActions: resolveSource(__dirname, './public/plainspace/dashboard/contentHeaderActions'),
  firstInstallCheck: resolveSource(__dirname, './public/assets/js/firstInstallCheck'),
  icons: resolveSource(__dirname, './public/assets/js/icons'),
  login: resolveSource(__dirname, './public/assets/js/login'),
  meltdownEmitter: resolveSource(__dirname, './public/assets/js/meltdownEmitter'),
  pageDataLoader: resolveSource(__dirname, './public/assets/js/pageDataLoader'),
  pageRenderer: resolveSource(__dirname, './public/plainspace/main/pageRenderer'),
  install: resolveSource(__dirname, './public/assets/js/install'),
  sortable: resolveSource(__dirname, './public/assets/js/sortable.min'),
  tokenLoader: resolveSource(__dirname, './public/assets/js/tokenLoader'),
  topHeaderActions: resolveSource(__dirname, './public/plainspace/dashboard/topHeaderActions'),
  openExplorer: resolveSource(__dirname, './public/assets/js/openExplorer'),
  pageActions: resolveSource(__dirname, './public/plainspace/dashboard/pageActions'),
  fontsLoader: resolveSource(__dirname, './public/assets/js/fontsLoader'),
  customSelect: resolveSource(__dirname, './public/assets/js/customSelect'),
  designerEditor: resolveSource(__dirname, './apps/designer/editor/editor')
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
      const key = rawEntry ? path.basename(rawEntry).replace(/\.(t|j)sx?$/i, '') : dirent.name;
      const base = rawEntry || 'index';
      const resolved = resolveSource(appsDir, path.join(dirent.name, base));
      entry[key] = `./apps/${resolved}`;
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
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    alias: {
      '/assets': path.resolve(__dirname, 'public/assets'),
      '/plainspace': path.resolve(__dirname, 'public/plainspace'),
      'assets': path.resolve(__dirname, 'public/assets'),
    }
  },
  module: {
    rules: [
      {
        test: /\.[tj]sx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
        },
      },
    ],
  },
  devtool: 'source-map'
};
