/**
 * mother/modules/moduleLoader/index.js
 *
 * Neuer, optimierter Module Loader mit Health-Check und Auto-Retry-Logik.
 * 
 * Folgende Highlights erwarten Sie:
 * 1) Prüfung, ob die Module sauber initialisiert werden können (Health Check).
 * 2) Nutzung einer einfachen Node-vm-Sandbox, um Module in Quarantäne zu testen.
 * 3) Deaktivierung fehlerhafter Module (wenn sie nicht kuschen wollen).
 * 4) Nach erfolgreichem Health Check erneutes "richtiges" Laden im Produktivmodus.
 * 5) Auto-Retry für zuvor gecrashte Module (zweite Chance für Chaos).
 * 6) Optionales Ausliefern von Grapes-Frontends.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Falls Sie einen eigenen NotificationEmitter haben, könnten Sie den hier integrieren:
const notificationEmitter = require('../../emitters/notificationEmitter');

// Safe wrapper to avoid losing critical errors when the emitter is missing
const notify = (payload) => {
  try {
    notificationEmitter.emit('notify', payload);
  } catch (e) {
    console.error('[NOTIFY-FALLBACK]', payload?.message || payload, e?.message);
  }
};

// meltdown registry - unsere Database-Helferlein
const {
  ensureModuleRegistrySchema,
  initGetModuleRegistryEvent,
  initListActiveGrapesModulesEvent,
  initListSystemModulesEvent,
  getModuleRegistry,
  insertModuleRegistryEntry,
  updateModuleLastError,
  deactivateModule
} = require('./moduleRegistryService');

const { initModuleRegistryAdminEvents } = require('./moduleRegistryEvents');

/**
 * Hauptfunktion, die Ihren Module Loader in Gang setzt. 
 * Hier wird:
 *  - das Schema validiert,
 *  - Events initialisiert,
 *  - das /modules-Verzeichnis ausgelesen
 *  - Module eingetragen (falls neu)
 *  - Aktive Module + ggf. Auto-Retry ausgeführt
 *  - Fertig gemeldete Frontends ausgeliefert (falls vorhanden).
 */
async function loadAllModules({ emitter, app, jwt }) {
  console.log('[MODULE LOADER] Starting up with enhanced Health Check...');

  const motherEmitter = emitter;
  const modulesPath = path.resolve(__dirname, '../../../modules');
  const ALLOW_INDIVIDUAL_SANDBOX = (process.env.ALLOW_INDIVIDUAL_SANDBOX !== 'false');

  // 1) Sicherstellen, dass unser module_registry-Schema auch wirklich existiert
  try {
    await ensureModuleRegistrySchema(motherEmitter, jwt);
  } catch (err) {
    console.error('[MODULE LOADER] Failed to ensure schema:', err.message);
    return;
  }

  // 2) meltdown Events für Registry-Fetch + Admin-Kram
  initGetModuleRegistryEvent(motherEmitter);
  initListActiveGrapesModulesEvent(motherEmitter);
  initListSystemModulesEvent(motherEmitter);
  initModuleRegistryAdminEvents(motherEmitter, app);

  // Ohne meltdown JWT können wir nichts laden. Also frühzeitiger Abbruch.
  if (!jwt) {
    console.warn('[MODULE LOADER] No meltdown JWT => cannot load optional modules. Doing nothing...');
    return;
  }

  // 3) modules directory checken
  if (!fs.existsSync(modulesPath)) {
    console.warn('[MODULE LOADER] Optional modules dir not found =>', modulesPath);
    return;
  }

  // 4) Registry aus DB holen
  let dbRegistry;
  try {
    dbRegistry = await getModuleRegistry(motherEmitter, jwt);
  } catch (err) {
    console.error('[MODULE LOADER] Error fetching module registry =>', err.message);
    return;
  }

  // 5) Im modules-Verzeichnis nach Unterordnern fahnden
  const folderNames = fs
    .readdirSync(modulesPath, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  // 6) Neue Module ins Registry pfeffern
  const knownNames = dbRegistry.map(r => r.module_name);

  for (const folder of folderNames) {
    const moduleFolderPath = path.join(modulesPath, folder);
    const moduleInfoPath = path.join(moduleFolderPath, 'moduleInfo.json');

    let moduleInfo = {};

    if (fs.existsSync(moduleInfoPath)) {
      try {
        moduleInfo = JSON.parse(fs.readFileSync(moduleInfoPath, 'utf8'));
      } catch (err) {
        console.error(`[MODULE LOADER] Error reading moduleInfo.json for "${folder}": ${err.message}. Using defaults.`);
      }
    } else {
      console.warn(`[MODULE LOADER] moduleInfo.json missing for "${folder}". Using defaults.`);
    }

    // Minimale Standardangaben
    if (!moduleInfo.moduleName)    moduleInfo.moduleName = folder;
    if (!moduleInfo.developer)     moduleInfo.developer  = 'Unknown Developer';
    if (!moduleInfo.version)       moduleInfo.version    = '';
    if (!moduleInfo.description)   moduleInfo.description= '';

    if (!knownNames.includes(folder)) {
      console.log(`[MODULE LOADER] Found new folder "${folder}", inserting into registry...`);
      try {
        await insertModuleRegistryEntry(motherEmitter, jwt, folder, true, null, moduleInfo);
        dbRegistry.push({
          module_name: folder,
          is_active: true,
          last_error: null,
          moduleInfo
        });
      } catch (e) {
        console.error('[MODULE LOADER] Error inserting module:', e.message);
      }
    }
  }

  // 7) PASS #1 => Alle aktiven Module durchprobieren
  for (const row of dbRegistry) {
    if (row.is_active) {
      await attemptModuleLoad(
        row,
        folderNames,
        modulesPath,
        motherEmitter,
        app,
        jwt,
        ALLOW_INDIVIDUAL_SANDBOX,
        false // Ist kein Auto-Retry, sondern der normale Ladevorgang
      );
    }
  }

  // 8) PASS #2 => Auto-Retry für ehemals gecrashte Module
  for (const row of dbRegistry) {
    if (!row.is_active && row.last_error && row.last_error.trim() !== '') {
      console.log(`[MODULE LOADER] Auto-retrying "${row.module_name}" => last error: ${row.last_error}`);
      await attemptModuleLoad(
        row,
        folderNames,
        modulesPath,
        motherEmitter,
        app,
        jwt,
        ALLOW_INDIVIDUAL_SANDBOX,
        true 
      );
    }
  }

  // 9) Optional Grapes Frontends ausliefern
  for (const row of dbRegistry) {
    if (row.is_active && row.moduleInfo && row.moduleInfo.grapesComponent) {
      const modName = row.module_name;
      const frontEndDir = path.join(modulesPath, modName, 'frontend');
      if (fs.existsSync(frontEndDir)) {
        console.log(`[MODULE LOADER] Serving frontend for Grapes module: ${modName}`);
        const express = require('express');
        app.use(`/modules/${modName}`, express.static(frontEndDir));
      }
    }
  }

  console.log('[MODULE LOADER] All optional modules loaded / retried successfully. The meltdown continues.');
}

// Lädt ein Modul in einer einfachen vm-Sandbox
function loadModuleSandboxed(indexJsPath) {
  const allowedBuiltins = new Set(['path', 'fs', 'crypto']);

  function sandboxRequire(reqPath) {
    if (allowedBuiltins.has(reqPath)) {
      return require(reqPath);
    }
    if (reqPath.startsWith('./') || reqPath.startsWith('../')) {
      const resolved = path.resolve(path.dirname(indexJsPath), reqPath);
      if (!resolved.startsWith(path.dirname(indexJsPath))) {
        throw new Error('Invalid require path');
      }
      return require(resolved);
    }
    throw new Error(`Access to '${reqPath}' is denied`);
  }

  const context = {
    module: { exports: {} },
    exports: {},
    require: sandboxRequire,
    __filename: indexJsPath,
    __dirname: path.dirname(indexJsPath),
    console,
    setTimeout,
    setInterval,
    clearTimeout,
    clearInterval,
    // expose only the OPENAI API key to sandboxed modules for security
    process: {
      env: {
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        GROK_API_KEY: process.env.GROK_API_KEY,
        XAI_API_KEY: process.env.XAI_API_KEY,
        BRAVE_API_KEY: process.env.BRAVE_API_KEY,
        NEWS_MODEL: process.env.NEWS_MODEL
      }
    }
  };
  vm.createContext(context);
  const code = fs.readFileSync(indexJsPath, 'utf8');
  vm.runInContext(code, context, { filename: indexJsPath });
  return context.module.exports;
}

/**
 * attemptModuleLoad: versucht das Laden eines einzelnen Moduls mit vorgeschaltetem Health-Check.
 * - Lädt Module aus dem entsprechenden Ordner
 * - Führt Health-Check durch (Test-Initialize)
 * - Falls Fehler -> Modul deaktivieren + remove event listeners
 * - Falls Erfolg -> realer Load-Vorgang (Initialize mit echtem Emitter)
 * - Falls Auto-Retry -> Re-Aktivierung in der DB
 */
async function attemptModuleLoad(
  registryRow,
  folderNames,
  modulesPath,
  motherEmitter,
  app,
  jwt,
  ALLOW_INDIVIDUAL_SANDBOX,
  isAutoRetry
) {
  const { module_name: moduleName } = registryRow;

  // Existiert der Ordner überhaupt noch?
  if (!folderNames.includes(moduleName)) {
    console.warn(`[MODULE LOADER] No folder => ${moduleName}. Possibly was deleted.`);
    return false;
  }

  // Force "community" – das will man ja meist so
  motherEmitter.registerModuleType(moduleName, 'community');

  const indexJsPath = path.join(modulesPath, moduleName, 'index.js');
  if (!fs.existsSync(indexJsPath)) {
    notify({
      moduleName,
      notificationType: 'system',
      priority: 'error',
      message: `[MODULE LOADER] Missing index.js in '${moduleName}'. Module disabled.`
    });
    await deactivateModule(motherEmitter, jwt, moduleName, 'Missing index.js');
    motherEmitter.emit('removeListenersByModule', { moduleName });
    return false;
  }

  if (isAutoRetry) {
    console.log(`[MODULE LOADER] Auto-retry => "${moduleName}" gets another chance.`);
  }

  let loadFailed = false;
  let modEntry;

  try {
    if (ALLOW_INDIVIDUAL_SANDBOX) {
      modEntry = loadModuleSandboxed(indexJsPath);
    } else {
      // Tja, wenn schon isoliert sein soll, aber ALLOW_INDIVIDUAL_SANDBOX = false...
      // Laden wir's eben direkt. Möge der Chaosgott uns gnädig sein.
      modEntry = require(indexJsPath);
    }
  } catch (err) {
    loadFailed = true;
    await handleModuleError(err, moduleName, motherEmitter, jwt);
  }

  if (!loadFailed) {
    try {
      // Erst mal Health-Check
      await performHealthCheck(modEntry, moduleName, app, jwt);

      // Wenn wir hier sind, lief der Health-Check sauber
      // => Modul "richtig" initialisieren
      await modEntry.initialize({
        motherEmitter,
        app,
        isCore: false,
        jwt
      });
    } catch (err) {
      loadFailed = true;
      await handleModuleError(err, moduleName, motherEmitter, jwt);
    }
  }

  if (loadFailed) {
    return false;
  }

  // Erfolgreiches Laden => last_error leeren
  await updateModuleLastError(motherEmitter, jwt, moduleName, null);

  // Falls Auto-Retry => wieder aktivieren
  if (isAutoRetry) {
    console.log(`[MODULE LOADER] Auto-retry => reactivating "${moduleName}".`);
    await new Promise((resolve, reject) => {
      motherEmitter.emit(
        'activateModuleInRegistry',
        {
          jwt,
          moduleName: 'moduleLoader',
          moduleType: 'core',
          targetModuleName: moduleName
        },
        (err2) => {
          if (err2) {
            notify({
              moduleName,
              notificationType: 'system',
              priority: 'error',
              message: `[MODULE LOADER] Failed to activate "${moduleName}": ${err2.message}`
            });
            return reject(err2);
          }
          resolve();
        }
      );
    });
  }

  console.log(`[MODULE LOADER] Successfully loaded => ${moduleName}`);
  return true;

  async function handleModuleError(err, moduleName, motherEmitter, jwt) {
    const errorMsg = `[E_MODULE_LOAD_FAILED] Error loading "${moduleName}": ${err.message}`;
    notify({
      moduleName,
      notificationType: 'system',
      priority: 'error',
      message: `[MODULE LOADER] ${moduleName} konnte nicht geladen werden: ${err.message}`
    });

    // Deaktivieren in DB
    await deactivateModule(motherEmitter, jwt, moduleName, errorMsg);

    // Emitter aufräumen
    motherEmitter.emit('removeListenersByModule', { moduleName });
  }
}

/**
 * performHealthCheck: Führen wir den "Testlauf" des Moduls durch.
 * Falls das Modul sich daneben benimmt (z.B. kein initialize() hat oder falsche Events raushaut),
 * fliegt es raus.
 */
async function performHealthCheck(modEntry, moduleName, app, jwt) {
  // 1) Hat das Modul überhaupt initialize()?
  if (!modEntry || typeof modEntry.initialize !== 'function') {
    throw new Error('[HEALTH CHECK] Module has no initialize() function.');
  }

  let healthCheckPassed = false;

  // 2) Probelauf in abgespeckter "Test-Emitter"-Umgebung
  const testEmitter = {
    emit(event, payload, cb) {
      // Wir prüfen, ob vernünftig ein Callback bereitgestellt wird
      if (typeof cb !== 'function') {
        throw new Error('HealthCheck-Emitter: A callback is required in emitter events.');
      }
      // Check, ob moduleName und moduleType korrekt sind
      if (!payload.moduleName || payload.moduleType !== 'community') {
        throw new Error(`Invalid payload from module "${moduleName}" – missing moduleName/moduleType.`);
      }
      healthCheckPassed = true;
      cb(null); // Simuliere erfolgreichen Callback
    },
    on() {
      /* Noop: Während des Health Checks lauschen wir auf nix. */
    },
    listenerCount() {
      // Modules may call listenerCount to avoid duplicate handlers. During
      // the health check we don't register listeners, so always return 0.
      return 0;
    },
    registerModuleType() {
      // Für den Testlauf nicht relevant, wir tun so als wäre es schon geschehen.
    }
  };

  // 3) Ausführen der initialize-Methode: wir hoffen, es knallt nicht.
  await modEntry.initialize({
    motherEmitter: testEmitter,
    app,
    isCore: false, 
    jwt
  });

  if (!healthCheckPassed) {
    throw new Error(
      `Health check failed: Module "${moduleName}" did not emit a valid event or never used the emitter.`
    );
  }
  // Läuft.
}

module.exports = {
  loadAllModules
};
