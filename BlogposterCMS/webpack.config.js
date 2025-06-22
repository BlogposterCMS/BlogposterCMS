const path = require('path');

module.exports = {
  mode: 'production',
  entry: {
    adminSearch: './public/assets/js/adminSearch.js',
    alpine: './public/assets/js/alpine.js',
    contentHeaderActions: './public/assets/plainspace/admin/contentHeaderActions.js',
    firstInstallCheck: './public/assets/js/firstInstallCheck.js',
    icons: './public/assets/js/icons.js',
    login: './public/assets/js/login.js',
    meltdownEmitter: './public/assets/js/meltdownEmitter.js',
    pageDataLoader: './public/assets/js/pageDataLoader.js',
    pageRenderer: './public/assets/plainspace/main/pageRenderer.js',
    
    install: './public/assets/js/install.js',
    sortable: './public/assets/js/sortable.min.js',
    tokenLoader: './public/assets/js/tokenLoader.js',
    topHeaderActions: './public/assets/plainspace/admin/topHeaderActions.js',
    openExplorer: './public/assets/js/openExplorer.js',
    pageActions: './public/assets/plainspace/admin/pageActions.js',
    fontsLoader: './public/assets/js/fontsLoader.js'
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'public', 'build'),
    clean: true
  },
  devtool: 'source-map'
};
