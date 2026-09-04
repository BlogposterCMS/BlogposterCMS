

const { requestBackendEvent } = require('../../contracts/backendEventContracts');

const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');

/**
 * mother/modules/moduleLoader/moduleRegistryEvents.js
 *
 * meltdown events for admin actions on the module registry:
 *   1) 'activateModuleInRegistry'
 *   2) 'deactivateModuleInRegistry'
 *
 * Also includes attemptSingleLoad to start the module runner immediately.
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const {
  deactivateModuleRuntime,
  onceCallback,
  removeListenersForModule
} = require('../../emitters/motherEmitter');
const { hasPermission } = require('../userManagement/permissionUtils');
const {
  getRegisteredModuleInfo,
  updateModuleLastError,
  deactivateModule,
  updateModuleInfo
} = require('./moduleRegistryService');
const { sanitizeModuleName } = require('../../utils/moduleUtils');
const {
  assertCommunityModuleFolderShape,
  readCommunityModuleInfo
} = require('./moduleFolderPolicy');
const { assertUserManagedModuleName } = require('./moduleOwnershipPolicy');
const {
  runCommunityModuleHealthCheck,
  startCommunityModuleProcess
} = require('./moduleProcessRuntime');
const {
  getGrantedModuleEvents,
  normalizeModuleInfoAccess,
  preserveTrustedAccess,
  TRUSTED_ACCESS_GRANTS_FIELD
} = require('./moduleAccessPolicy');
const {
  assertCanApproveRequest,
  sharedModuleAccessConsentManager
} = require('./moduleAccessConsent');

function assertInside(baseDir, candidatePath, label = 'path') {
  const root = path.resolve(baseDir);
  const resolved = path.resolve(candidatePath);
  const rootPrefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  const compareRoot = process.platform === 'win32' ? root.toLowerCase() : root;
  const compareResolved = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  const compareRootPrefix = process.platform === 'win32' ? rootPrefix.toLowerCase() : rootPrefix;
  if (compareResolved !== compareRoot && !compareResolved.startsWith(compareRootPrefix)) {
    throw new Error(`[REGISTRY EVENTS] ${label} escapes module root.`);
  }
  return resolved;
}

function readModuleInfo(modulePath, moduleName) {
  return readCommunityModuleInfo(modulePath, moduleName, { modulesRoot: path.dirname(modulePath) });
}

async function cleanupModuleRuntime(motherEmitter, moduleName, reason = 'Module deactivated') {
  const safeModuleName = sanitizeModuleName(moduleName);
  sharedModuleAccessConsentManager.rejectAllForModule(safeModuleName, reason);
  const loadedModule = global.loadedModules?.[safeModuleName];
  if (loadedModule && typeof loadedModule.stop === 'function') {
    await loadedModule.stop(reason);
  }
  if (global.loadedModules) delete global.loadedModules[safeModuleName];
  deactivateModuleRuntime(motherEmitter, safeModuleName, reason);
  removeListenersForModule(motherEmitter, safeModuleName);
}

function assertRegistryAdminPayload(payload, eventName) {
  const { jwt, moduleName, moduleType } = payload || {};
  if (!jwt || moduleName !== 'moduleLoader' || moduleType !== 'core') {
    throw new Error(`[E_MODULE_ACCESS_ADMIN_PAYLOAD] ${eventName} => must come from moduleLoader/core.`);
  }
}

function requireModuleAccessManagePermission(payload) {
  if (!payload?.decodedJWT || !hasPermission(payload.decodedJWT, 'modules.manageAccess')) {
    throw new Error('[E_MODULE_ACCESS_CONSENT_PERMISSION] Forbidden - missing permission: modules.manageAccess');
  }
}

function permissionActorId(decodedJWT = {}) {
  return decodedJWT.userId || decodedJWT.sub || decodedJWT.id || null;
}

async function persistPermanentAccessGrant(motherEmitter, jwt, request, decodedJWT) {
  if (!request?.allowPermanent) {
    throw new Error(`[E_MODULE_ACCESS_CONSENT_PERMANENT_DENIED] Event "${request?.event || ''}" cannot be granted permanently.`);
  }

  const moduleInfo = await getRegisteredModuleInfo(motherEmitter, jwt, request.moduleName);
  const previousGrants = Array.isArray(moduleInfo?.[TRUSTED_ACCESS_GRANTS_FIELD])
    ? moduleInfo[TRUSTED_ACCESS_GRANTS_FIELD]
    : [];
  const now = new Date().toISOString();
  const nextGrant = {
    event: request.event,
    resource: request.resource,
    action: request.action,
    reason: request.reason || '',
    risk: request.risk || 'standard',
    granted: true,
    grantedAt: now,
    grantedBy: permissionActorId(decodedJWT)
  };
  const nextInfo = {
    ...moduleInfo,
    [TRUSTED_ACCESS_GRANTS_FIELD]: [
      ...previousGrants.filter(grant => grant?.event !== request.event),
      nextGrant
    ]
  };

  await updateModuleInfo(motherEmitter, jwt, request.moduleName, nextInfo);
  return nextGrant;
}

function initModuleRegistryAdminEvents(motherEmitter, app) {
  motherEmitter.on(BACKEND_EVENTS.LIST_PENDING_MODULE_ACCESS_REQUESTS, async (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    try {
      assertRegistryAdminPayload(payload, BACKEND_EVENTS.LIST_PENDING_MODULE_ACCESS_REQUESTS);
      requireModuleAccessManagePermission(payload);
      callback(null, sharedModuleAccessConsentManager.listPendingRequests({
        moduleName: payload.targetModuleName
      }));
    } catch (ex) {
      callback(ex);
    }
  });

  motherEmitter.on(BACKEND_EVENTS.RESOLVE_MODULE_ACCESS_REQUEST, async (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    try {
      assertRegistryAdminPayload(payload, BACKEND_EVENTS.RESOLVE_MODULE_ACCESS_REQUEST);
      requireModuleAccessManagePermission(payload);

      const requestId = String(payload.requestId || '').trim();
      const request = sharedModuleAccessConsentManager.getPendingRequest(requestId);
      if (!request) {
        throw new Error(`[E_MODULE_ACCESS_CONSENT_MISSING] Module access request "${requestId}" is not pending.`);
      }

      const approved = payload.decision === 'approve' || payload.approved === true;
      const mode = payload.mode === 'always' ? 'always' : 'once';
      let grant = null;

      if (approved) {
        assertCanApproveRequest(payload.decodedJWT, request);
        if (mode === 'always') {
          grant = await persistPermanentAccessGrant(motherEmitter, payload.jwt, request, payload.decodedJWT);
        }
      }

      const resolved = sharedModuleAccessConsentManager.resolveRequest(requestId, {
        approved,
        mode,
        jwt: payload.jwt,
        decodedJWT: payload.decodedJWT,
        grantedBy: permissionActorId(payload.decodedJWT)
      });

      callback(null, { request: resolved, grant });
    } catch (ex) {
      callback(ex);
    }
  });

  // meltdown => 'activateModuleInRegistry'
  motherEmitter.on(BACKEND_EVENTS.ACTIVATE_MODULE_IN_REGISTRY, async (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    try {
      const { jwt, moduleName, moduleType, targetModuleName } = payload;
      if (!jwt || moduleName !== 'moduleLoader' || moduleType !== 'core') {
        return callback(new Error('[REGISTRY EVENTS] meltdown => must come from moduleLoader/core.'));
      }

      if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'modules.activate')) {
        return callback(new Error('Forbidden – missing permission: modules.activate'));
      }

      const safeTargetModuleName = assertUserManagedModuleName(targetModuleName, 'activated');

      // meltdown => dbUpdate => set is_active=TRUE
      requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_UPDATE, {
          jwt,
          moduleName: 'moduleLoader',
          moduleType: 'core',
          table: 'module_registry',
          where: { module_name: safeTargetModuleName },
          data: {
            is_active: true,
            last_error: null,
            updated_at: new Date().toISOString()
          }
        }).then(async () => {
  console.log(`[REGISTRY EVENTS] Attempting immediate load => ${safeTargetModuleName}`);
  const success = await attemptSingleLoad(safeTargetModuleName, motherEmitter, app, jwt, {
    approvedAccess: payload.approvedAccess,
    grantedBy: payload.decodedJWT?.userId
  });
  if (!success) {
    return callback(new Error('Module load failed again. We tried.'));
  }
  callback(null);
}, err => {
  return callback(err);
});
    } catch (ex) {
      callback(ex);
    }
  });

  // meltdown => 'deactivateModuleInRegistry'
  motherEmitter.on(BACKEND_EVENTS.DEACTIVATE_MODULE_IN_REGISTRY, (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    try {
      const { jwt, moduleName, moduleType, targetModuleName } = payload;
      if (!jwt || moduleName !== 'moduleLoader' || moduleType !== 'core') {
        return callback(new Error('[REGISTRY EVENTS] meltdown => must come from moduleLoader/core.'));
      }

      if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'modules.deactivate')) {
        return callback(new Error('Forbidden – missing permission: modules.deactivate'));
      }

      const safeTargetModuleName = assertUserManagedModuleName(targetModuleName, 'deactivated');

      // meltdown => dbUpdate => is_active=FALSE
      requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_UPDATE, {
          jwt,
          moduleName: 'moduleLoader',
          moduleType: 'core',
          table: 'module_registry',
          where: { module_name: safeTargetModuleName },
          data: {
            is_active: false,
            updated_at: new Date().toISOString()
          }
        }).then(async () => {
  await cleanupModuleRuntime(motherEmitter, safeTargetModuleName, 'Module deactivated via registry.');
  console.log(`[REGISTRY EVENTS] Deactivated module => ${safeTargetModuleName}`);
  callback(null, {
    moduleName: safeTargetModuleName,
    deactivated: true
  });
}, err => {
  return callback(err);
});
    } catch (ex) {
      callback(ex);
    }
  });

  // meltdown => 'installModuleFromZip'
  motherEmitter.on(BACKEND_EVENTS.INSPECT_MODULE_ZIP_ACCESS, async (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    try {
      const { jwt, moduleName, moduleType, zipData } = payload || {};
      if (!jwt || moduleName !== 'moduleLoader' || moduleType !== 'core') {
        return callback(new Error('[REGISTRY EVENTS] inspectModuleZipAccess => invalid meltdown payload.'));
      }
      if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'modules.install')) {
        return callback(new Error('Forbidden â€“ missing permission: modules.install'));
      }
      if (!zipData) {
        return callback(new Error('[E_MODULE_INSPECT_ZIP_MISSING] No zipData provided.'));
      }

      const buffer = Buffer.isBuffer(zipData) ? zipData : Buffer.from(zipData, 'base64');
      const { inspectModuleZipBuffer } = require('./moduleInstallerService');
      callback(null, inspectModuleZipBuffer(buffer));
    } catch (ex) {
      callback(ex);
    }
  });

  // meltdown => 'installModuleFromZip'
  motherEmitter.on(BACKEND_EVENTS.INSTALL_MODULE_FROM_ZIP, async (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    try {
      const { jwt, moduleName, moduleType, zipData } = payload || {};
      if (!jwt || moduleName !== 'moduleLoader' || moduleType !== 'core') {
        return callback(new Error('[REGISTRY EVENTS] installModuleFromZip => invalid meltdown payload.'));
      }

      if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'modules.install')) {
        return callback(new Error('Forbidden – missing permission: modules.install'));
      }

      if (!zipData) {
        return callback(new Error('No zipData provided.'));
      }

      const buffer = Buffer.isBuffer(zipData) ? zipData : Buffer.from(zipData, 'base64');

      const { installModuleFromZip } = require('./moduleInstallerService');
      const result = await installModuleFromZip(motherEmitter, jwt, buffer, {
        notifyAdmin: true,
        approvedAccess: payload.approvedAccess || [],
        grantedBy: payload.decodedJWT?.userId
      });
      callback(null, result);
    } catch (ex) {
      callback(ex);
    }
  });

  motherEmitter.on(BACKEND_EVENTS.CHECK_MODULE_UPDATES, async (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    try {
      const { jwt, moduleName, moduleType } = payload || {};
      if (!jwt || moduleName !== 'moduleLoader' || moduleType !== 'core') {
        return callback(new Error('[REGISTRY EVENTS] checkModuleUpdates => invalid meltdown payload.'));
      }
      if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'modules.list')) {
        return callback(new Error('Forbidden - missing permission: modules.list'));
      }

      const { checkModuleUpdates } = require('./moduleUpdateService');
      const result = await checkModuleUpdates(motherEmitter, jwt, {
        targetModuleName: payload.targetModuleName
      });
      callback(null, result);
    } catch (ex) {
      callback(ex);
    }
  });

  motherEmitter.on(BACKEND_EVENTS.INSPECT_MODULE_UPDATE, async (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    try {
      const { jwt, moduleName, moduleType, targetModuleName } = payload || {};
      if (!jwt || moduleName !== 'moduleLoader' || moduleType !== 'core') {
        return callback(new Error('[REGISTRY EVENTS] inspectModuleUpdate => invalid meltdown payload.'));
      }
      if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'modules.install')) {
        return callback(new Error('Forbidden - missing permission: modules.install'));
      }

      const { inspectModuleUpdate } = require('./moduleUpdateService');
      const result = await inspectModuleUpdate(motherEmitter, jwt, { targetModuleName });
      callback(null, result);
    } catch (ex) {
      callback(ex);
    }
  });

  motherEmitter.on(BACKEND_EVENTS.INSTALL_MODULE_UPDATE, async (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    try {
      const { jwt, moduleName, moduleType, targetModuleName } = payload || {};
      if (!jwt || moduleName !== 'moduleLoader' || moduleType !== 'core') {
        return callback(new Error('[REGISTRY EVENTS] installModuleUpdate => invalid meltdown payload.'));
      }
      if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'modules.install')) {
        return callback(new Error('Forbidden - missing permission: modules.install'));
      }

      const { installModuleUpdate } = require('./moduleUpdateService');
      const result = await installModuleUpdate(motherEmitter, jwt, {
        targetModuleName,
        approvedAccess: payload.approvedAccess,
        grantedBy: payload.decodedJWT?.userId
      });
      if (result.wasActive) {
        await cleanupModuleRuntime(motherEmitter, result.moduleName, 'Module update installed.');
        const success = await attemptSingleLoad(result.moduleName, motherEmitter, app, jwt);
        if (!success) {
          return callback(new Error(`[E_MODULE_UPDATE_RELOAD_FAILED] Updated module "${result.moduleName}" could not be restarted.`));
        }
      }
      callback(null, result);
    } catch (ex) {
      callback(ex);
    }
  });

  motherEmitter.on(BACKEND_EVENTS.SET_MODULE_UPDATE_SOURCE, async (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    try {
      const { jwt, moduleName, moduleType, targetModuleName } = payload || {};
      if (!jwt || moduleName !== 'moduleLoader' || moduleType !== 'core') {
        return callback(new Error('[REGISTRY EVENTS] setModuleUpdateSource => invalid meltdown payload.'));
      }
      if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'modules.install')) {
        return callback(new Error('Forbidden - missing permission: modules.install'));
      }

      const { setModuleUpdateSource } = require('./moduleUpdateService');
      const result = await setModuleUpdateSource(motherEmitter, jwt, {
        targetModuleName,
        trustedUpdateSource: payload.trustedUpdateSource
      });
      callback(null, result);
    } catch (ex) {
      callback(ex);
    }
  });
}

async function attemptSingleLoad(moduleName, motherEmitter, app, jwt, options = {}) {
  // attempt to require & initialize the module
  try {
    moduleName = sanitizeModuleName(moduleName);
    const modulesDir = path.resolve(options.modulesRoot || path.resolve(__dirname, '../../../modules'));
    const modulePath = assertInside(modulesDir, path.join(modulesDir, moduleName), 'module path');
    const indexJs = assertInside(modulePath, path.join(modulePath, 'index.js'), 'module entry');
    assertCommunityModuleFolderShape(modulePath, moduleName, { modulesRoot: modulesDir });

    if (!fs.existsSync(indexJs)) {
      console.warn(`[REGISTRY EVENTS] No index.js => ${moduleName}`);
      await deactivateModule(motherEmitter, jwt, moduleName, 'Missing index.js');
      await cleanupModuleRuntime(motherEmitter, moduleName, 'Missing index.js');
      return false;
    }

    if (typeof motherEmitter.registerModuleType === 'function') {
      motherEmitter.registerModuleType(moduleName, 'community');
    }

    const manifestInfo = readModuleInfo(modulePath, moduleName);
    const registryInfo = await getRegisteredModuleInfo(motherEmitter, jwt, moduleName);
    let moduleInfo = preserveTrustedAccess(manifestInfo, registryInfo);
    if (Array.isArray(options.approvedAccess)) {
      moduleInfo = normalizeModuleInfoAccess(moduleInfo, moduleName, {
        approvedAccess: options.approvedAccess,
        grantedBy: options.grantedBy
      });
      await updateModuleInfo(motherEmitter, jwt, moduleName, moduleInfo);
    }
    const { ensureModulePermissionDeclarations } = require('./moduleInstallerService');
    await ensureModulePermissionDeclarations(motherEmitter, jwt, moduleInfo);
    const accessGrants = getGrantedModuleEvents(moduleInfo);
    const nonce = crypto.randomBytes(16).toString('hex');
    if (process.env.ALLOW_COMMUNITY_APP_ACCESS === 'true') {
      console.warn('[REGISTRY EVENTS] Ignoring ALLOW_COMMUNITY_APP_ACCESS=true; community modules never receive the raw Express app.');
    }
    await runCommunityModuleHealthCheck({
      indexJsPath: indexJs,
      jwt,
      moduleDir: modulePath,
      moduleInfo,
      moduleName,
      motherEmitter,
      nonce,
      accessGrants
    });

    const runtime = await startCommunityModuleProcess({
      app,
      indexJsPath: indexJs,
      jwt,
      moduleDir: modulePath,
      moduleInfo,
      moduleName,
      motherEmitter,
      nonce,
      phase: 'runtime',
      accessGrants,
      accessConsentManager: sharedModuleAccessConsentManager
    });

    // set last_error=null on success
    await updateModuleLastError(motherEmitter, jwt, moduleName, null);
    global.loadedModules = global.loadedModules || {};
    global.loadedModules[moduleName] = runtime.getRuntimeRecord();
    console.log(`[REGISTRY EVENTS] Activated & loaded => ${moduleName}`);
    return true;
  } catch (err) {
    console.error('[REGISTRY EVENTS] attemptSingleLoad => meltdown meltdown =>', err.message);
    await deactivateModule(motherEmitter, jwt, moduleName, err.message);
    await cleanupModuleRuntime(motherEmitter, moduleName, err.message);
    return false;
  }
}

module.exports = {
  initModuleRegistryAdminEvents,
  _internals: {
    attemptSingleLoad,
    assertInside,
    cleanupModuleRuntime,
    readModuleInfo
  }
};
