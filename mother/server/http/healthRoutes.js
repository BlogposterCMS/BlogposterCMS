'use strict';

const express = require('express');

function createHealthRoutes({ version, readiness = () => ({ ready: true }) } = {}) {
  const router = express.Router();
  const productVersion = String(version || '').trim() || 'unknown';

  router.get('/health/live', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.status(200).json({
      code: 'BLOGPOSTER_LIVE',
      status: 'live',
      version: productVersion
    });
  });

  router.get('/health/ready', async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const result = await readiness();
      if (!result || result.ready !== true) {
        return res.status(503).json({
          code: result?.code || 'BLOGPOSTER_NOT_READY',
          status: 'not-ready',
          version: productVersion
        });
      }
      return res.status(200).json({
        code: 'BLOGPOSTER_READY',
        status: 'ready',
        version: productVersion
      });
    } catch {
      return res.status(503).json({
        code: 'BLOGPOSTER_READINESS_FAILED',
        status: 'not-ready',
        version: productVersion
      });
    }
  });

  return router;
}

module.exports = {
  createHealthRoutes
};
