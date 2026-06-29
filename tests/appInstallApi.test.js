const express = require('express');
const axios = require('axios');

const { createAppManagementRoutes } = require('../mother/server/http/appManagementRoutes');

function startApp(app) {
  return new Promise(resolve => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('app install and delete HTTP routes are not mounted', async () => {
  const app = express();
  app.use(express.json());
  app.use(createAppManagementRoutes({
    csrfProtection: (_req, _res, next) => next(),
    motherEmitter: {},
    validateAdminToken: async () => ({ permissions: { '*': true } })
  }));

  const server = await startApp(app);
  const port = server.address().port;
  const client = axios.create({
    baseURL: `http://127.0.0.1:${port}`,
    proxy: false,
    validateStatus: () => true
  });

  try {
    const install = await client.post('/admin/api/apps/install', {
      appName: 'designer',
      sourceDir: 'C:/tmp/designer'
    });
    const remove = await client.delete('/admin/api/apps/designer');

    expect(install.status).toBe(404);
    expect(remove.status).toBe(404);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
