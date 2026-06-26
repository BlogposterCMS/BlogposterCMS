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
  adminSearch: resolveSource(__dirname, './ui/shell/entries/adminSearch'),
  agentConsole: resolveSource(__dirname, './ui/shared/entries/agentConsole'),
  appBridge: resolveSource(__dirname, './ui/shared/entries/appBridge'),
  appFrameLoader: resolveSource(__dirname, './ui/shell/entries/appFrameLoader'),
  contentHeaderActions: resolveSource(__dirname, './ui/shell/entries/contentHeaderActions'),
  firstInstallCheck: resolveSource(__dirname, './ui/shell/entries/firstInstallCheck'),
  install: resolveSource(__dirname, './ui/shell/entries/install'),
  login: resolveSource(__dirname, './ui/shell/entries/login'),
  loginStrategiesPublic: resolveSource(__dirname, './ui/shell/entries/loginStrategiesPublic'),
  notificationHub: resolveSource(__dirname, './ui/shell/entries/notificationHub'),
  openExplorer: resolveSource(__dirname, './ui/shell/entries/openExplorer'),
  pageActions: resolveSource(__dirname, './ui/shell/entries/pageActions'),
  pageDataLoader: resolveSource(__dirname, './ui/shell/entries/pageDataLoader'),
  register: resolveSource(__dirname, './ui/shell/entries/register'),
  topHeaderActions: resolveSource(__dirname, './ui/shell/entries/topHeaderActions'),
  userColor: resolveSource(__dirname, './ui/shell/entries/userColor'),
  workspaces: resolveSource(__dirname, './ui/shell/entries/workspaces'),
  pageRenderer: resolveSource(__dirname, './ui/runtime/entries/pageRenderer'),
  publicEntry: resolveSource(__dirname, './ui/runtime/entries/publicEntry'),
  designer: resolveSource(__dirname, './ui/designer/entries/designer'),
  designerEditor: resolveSource(__dirname, './ui/designer/entries/designerEditor'),
  widgetsPanel: resolveSource(__dirname, './ui/widgets/entries/widgetsPanel'),
  customSelect: resolveSource(__dirname, './ui/shared/entries/customSelect'),
  devBanner: resolveSource(__dirname, './ui/shared/entries/devBanner'),
  faviconLoader: resolveSource(__dirname, './ui/shared/entries/faviconLoader'),
  fontsLoader: resolveSource(__dirname, './ui/shared/entries/fontsLoader'),
  icons: resolveSource(__dirname, './ui/shared/entries/icons'),
  meltdownEmitter: resolveSource(__dirname, './ui/shared/entries/meltdownEmitter'),
  sortable: resolveSource(__dirname, './ui/shared/entries/sortable'),
  tokenLoader: resolveSource(__dirname, './ui/shared/entries/tokenLoader')
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
      if (entry[key]) return;
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
      '@ui': path.resolve(__dirname, 'ui'),
      '/ui': path.resolve(__dirname, 'ui'),
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
  optimization: {
    splitChunks: {
      // HTML shells load one named entry file directly; only async chunks are safe to split here.
      chunks: 'async',
      minSize: 20 * 1024,
      maxSize: 180 * 1024
    }
  },
  devtool: 'source-map'
};
