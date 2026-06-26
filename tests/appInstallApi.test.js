const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

test('install and uninstall app copies and removes folder', async () => {
  const root = fs.mkdtempSync(path.join(__dirname, 'tmp-app-'));
  const sourceDir = path.join(root, 'src');
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, 'app.json'), '{}');
  fs.writeFileSync(path.join(sourceDir, 'index.html'), '<!doctype html>');
  const appsDir = path.join(root, 'apps');
  fs.mkdirSync(appsDir);

  const app = express();
  app.use(bodyParser.json());
  app.post('/admin/api/apps/install', (req, res) => {
    const dest = path.join(appsDir, req.body.appName);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.cpSync(sourceDir, dest, { recursive: true });
    res.status(201).json({ installed: req.body.appName });
  });
  app.delete('/admin/api/apps/:name', (req, res) => {
    const dest = path.join(appsDir, req.params.name);
    fs.rmSync(dest, { recursive: true, force: true });
    res.json({ removed: req.params.name });
  });

  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  const port = server.address().port;

  await axios.post(`http://localhost:${port}/admin/api/apps/install`, { appName: 'foo' });
  expect(fs.existsSync(path.join(appsDir, 'foo', 'index.html'))).toBe(true);

  await axios.delete(`http://localhost:${port}/admin/api/apps/foo`);
  expect(fs.existsSync(path.join(appsDir, 'foo'))).toBe(false);

  server.close();
  fs.rmSync(root, { recursive: true, force: true });
});
