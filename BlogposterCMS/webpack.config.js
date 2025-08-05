const path = require('path');

module.exports = {
  mode: 'production',
  entry: {
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
    pagesMenu: './public/plainspace/dashboard/pagesMenu.js',
    customSelect: './public/assets/js/customSelect.js'
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'public', 'build'),
    clean: true
  },
  resolve: {
    alias: {
      '/plainspace': path.resolve(__dirname, 'apps/plainspace')
    }
  },
  devtool: 'source-map'
};
