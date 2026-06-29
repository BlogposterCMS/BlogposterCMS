'use strict';

const { createAgentApiRouter } = require('../../modules/agentManager/httpApi');
const {
  createAgentAccessAdminRouter,
  createAgentAccessPublicRouter
} = require('../../modules/agentAccess/httpApi');

function mountAgentApiRoutes(app, {
  csrfProtection,
  loginLimiter,
  motherEmitter,
  validateAdminToken
}) {
  app.use('/admin/api/agent-access', loginLimiter, createAgentAccessPublicRouter({
    motherEmitter
  }));

  app.use('/admin/api/agent-access', csrfProtection, createAgentAccessAdminRouter({
    motherEmitter,
    validateAdminToken
  }));

  app.use('/admin/api/agent', csrfProtection, createAgentApiRouter({
    motherEmitter,
    validateAdminToken
  }));
}

module.exports = {
  mountAgentApiRoutes
};
