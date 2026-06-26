const express = require('express');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

test('GET /assets/icon-list.json returns svg list', async () => {
  const app = express();
  const assetsPath = path.join(__dirname, '..', 'public', 'assets');
  app.get('/assets/icon-list.json', async (req, res) => {
    try {
      const files = await fs.promises.readdir(path.join(assetsPath, 'icons'));
      const icons = files.filter(f => f.endsWith('.svg'));
      res.json(icons);
    } catch (err) {
      res.status(500).json({ error: 'Unable to load icons' });
    }
  });
  const server = await new Promise(resolve => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = server.address().port;
  const res = await axios.get(`http://localhost:${port}/assets/icon-list.json`);
  expect(res.status).toBe(200);
  expect(Array.isArray(res.data)).toBe(true);
  expect(res.data).toContain('plus.svg');
  server.close();
});
