'use strict';

const AdmZip = require('adm-zip');
const bcrypt = require('bcrypt');
const bcryptjs = require('bcryptjs');
const express = require('express');
const http = require('http');
const { mountSecurityMiddleware } = require('../mother/server/http/securityMiddleware');

describe('dependency security and compatibility', () => {
  test.each([0, 8])('ZIP method %s does not allocate an attacker-declared size', method => {
    const archive = new AdmZip();
    archive.addFile('nested/control.txt', Buffer.from('small legitimate content'));
    archive.getEntry('nested/control.txt').header.method = method;
    const bytes = archive.toBuffer();
    const centralHeader = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    expect(centralHeader).toBeGreaterThan(0);
    expect(bytes.readUInt16LE(centralHeader + 10)).toBe(method);
    expect(new AdmZip(bytes).readAsText('nested/control.txt')).toBe('small legitimate content');

    // A tiny archive used to request nearly 4 GiB before validating its payload.
    // Trap oversized allocations so this regression stays safe on old versions.
    bytes.writeUInt32LE(0xfffffffe, centralHeader + 24);
    const allocations = ['alloc', 'allocUnsafe', 'allocUnsafeSlow'].map(name => {
      const original = Buffer[name];
      return jest.spyOn(Buffer, name).mockImplementation((size, ...args) => {
        if (size > 1024 * 1024) throw new Error('ZIP_UNBOUNDED_ALLOCATION');
        return original(size, ...args);
      });
    });
    try {
      expect(new AdmZip(bytes).readAsText('nested/control.txt')).toBe('small legitimate content');
    } finally {
      allocations.forEach(spy => spy.mockRestore());
    }
  });

  test('native bcrypt still accepts existing bcryptjs hashes and vice versa', async () => {
    const password = 'generic compatibility fixture';
    const existingHash = bcryptjs.hashSync(password, 4);
    expect(await bcrypt.compare(password, existingHash)).toBe(true);
    expect(await bcrypt.compare('incorrect', existingHash)).toBe(false);
    expect(bcryptjs.compareSync(password, await bcrypt.hash(password, 4))).toBe(true);
  });

  test('Express 4 query and form parsing retain nested fields without prototype pollution', async () => {
    const app = express();
    mountSecurityMiddleware(app, { isProduction: false });
    app.all('/parse', (req, res) => res.json({ query: req.query, body: req.body }));
    const server = await new Promise(resolve => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    const request = (method, path, body = '') => new Promise((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port: server.address().port, method, path,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, res => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => resolve(JSON.parse(data)));
      });
      req.on('error', reject);
      req.end(body);
    });
    try {
      const query = await request('GET', '/parse?filter[tag]=docs&__proto__[polluted]=true');
      expect(query.query.filter).toEqual({ tag: 'docs' });
      expect(Object.hasOwn(query.query, '__proto__')).toBe(false);
      const form = await request('POST', '/parse', 'page[title]=Control&constructor[prototype][polluted]=true');
      expect(form.body.page).toEqual({ title: 'Control' });
      expect({}.polluted).toBeUndefined();
      // The security override must not silently migrate the router to Express 5.
      expect(require('express/package.json').version.split('.')[0]).toBe('4');
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });
});
