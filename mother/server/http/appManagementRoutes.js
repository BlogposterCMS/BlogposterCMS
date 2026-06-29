'use strict';

const express = require('express');
const { hasPermission } = require('../../modules/userManagement/permissionUtils');
const {
  seedAdminPages: seedAdminPages,
  seedAdminWidget: seedAdminWidget
} = require('../../modules/plainSpace/plainSpaceService');
const { DEFAULT_WIDGETS } = require('../../modules/plainSpace/config/defaultWidgets');
const { ADMIN_PAGES } = require('../../modules/plainSpace/config/adminPages');

function createAppManagementRoutes({
  csrfProtection,
  motherEmitter,
  validateAdminToken
}) {
  const router = express.Router();

  // Apps are internal, core-owned admin tools in v1. The loader still discovers
  // bundled tool surfaces, but HTTP must not expose marketplace-style app
  // install or delete routes.

  router.post('/admin/api/plainspace/reseed', csrfProtection, async (req, res) => {
    const adminJwt = req.cookies?.admin_jwt;
    if (!adminJwt) return res.status(401).send('Unauthorized');

    let decoded;
    try {
      decoded = await validateAdminToken(adminJwt);
    } catch {
      return res.status(401).send('Unauthorized');
    }
    const allowed = hasPermission(decoded, 'builder.manage') ||
      hasPermission(decoded, 'plainspace.saveLayout');
    if (!allowed) return res.status(403).send('Forbidden');

    try {
      let widgetCount = 0;
      for (const widget of DEFAULT_WIDGETS) {
        const { options = {}, ...data } = widget;
        await seedAdminWidget(motherEmitter, adminJwt, data, options);
        widgetCount++;
      }

      await seedAdminPages(motherEmitter, adminJwt, ADMIN_PAGES);
      return res.json({
        success: true,
        widgetsSeeded: widgetCount,
        pagesSeeded: ADMIN_PAGES.length
      });
    } catch (err) {
      console.error('[RESEED] Failed:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}

module.exports = {
  createAppManagementRoutes
};
