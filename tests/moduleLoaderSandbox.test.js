const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { _internals } = require('../mother/modules/moduleLoader');
const { createCommunityHealthCheckHost } = require('../mother/modules/moduleLoader/moduleHost');

function withTempModule(files, fn) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-module-sandbox-'));
  const root = path.join(parent, 'module');
  fs.mkdirSync(root);
  try {
    for (const [fileName, contents] of Object.entries(files)) {
      const filePath = path.join(root, fileName);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, contents);
    }
    return fn(root);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
}

function withEnv(values, fn) {
  const previous = {};
  for (const key of Object.keys(values)) {
    previous[key] = process.env[key];
    if (values[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = values[key];
    }
  }

  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test('module loader sandbox exposes read-only fs scoped to the module folder', () => {
  withTempModule({
    'data.txt': 'inside',
    'child.js': `
      const fs = require('fs');
      module.exports = {
        readOutside() {
          return fs.readFileSync('../outside.txt', 'utf8');
        }
      };
    `,
    'index.js': `
      const fs = require('fs');
      const child = require('./child');
      module.exports = {
        readOwn() {
          return fs.readFileSync('data.txt', 'utf8');
        },
        writeOwn() {
          return fs.writeFileSync('data.txt', 'changed');
        },
        readOutsideFromChild: child.readOutside
      };
    `
  }, root => {
    fs.writeFileSync(path.join(path.dirname(root), 'outside.txt'), 'outside');
    const mod = _internals.loadModuleSandboxed(path.join(root, 'index.js'));

    assert.strictEqual(mod.readOwn(), 'inside');
    assert.throws(() => mod.writeOwn(), /read-only/);
    assert.throws(() => mod.readOutsideFromChild(), /inside the module folder/);
  });
});

test('module loader sandbox refuses relative requires outside the module folder', () => {
  withTempModule({
    'index.js': `
      module.exports = require('../outside');
    `
  }, root => {
    fs.writeFileSync(path.join(path.dirname(root), 'outside.js'), 'module.exports = {};');
    assert.throws(
      () => _internals.loadModuleSandboxed(path.join(root, 'index.js')),
      /inside the module folder/
    );
  });
});

test('module loader sandbox refuses host process imports', () => {
  withTempModule({
    'index.js': `
      module.exports = require('child_process');
    `
  }, root => {
    assert.throws(
      () => _internals.loadModuleSandboxed(path.join(root, 'index.js')),
      /Access to 'child_process' is denied/
    );
  });
});

test('module loader sandbox refuses dynamic code escape patterns', () => {
  withTempModule({
    'index.js': `
      module.exports = {
        run() {
          return Function('return process')();
        }
      };
    `
  }, root => {
    assert.throws(
      () => _internals.loadModuleSandboxed(path.join(root, 'index.js')),
      /Function constructor is not available/
    );
  });

  withTempModule({
    'index.js': `
      module.exports = {
        run() {
          return ({}).constructor.constructor('return process')();
        }
      };
    `
  }, root => {
    assert.throws(
      () => _internals.loadModuleSandboxed(path.join(root, 'index.js')),
      /constructor\.constructor escape patterns/
    );
  });
});

test('module loader sandbox hardens exposed host facades', () => {
  withTempModule({
    'data.txt': 'inside',
    'index.js': `
      const fs = require('fs');
      const path = require('path');
      const crypto = require('crypto');
      const sanitizeHtml = require('sanitize-html');

      module.exports = {
        inspect() {
          const stat = fs.statSync('data.txt');
          const entries = fs.readdirSync('.', { withFileTypes: true });
          return {
            requireCtor: require.constructor,
            pathJoinCtor: path.join.constructor,
            pathJoinProto: Object.getPrototypeOf(path.join),
            fsReadCtor: fs.readFileSync.constructor,
            statCtor: stat.constructor,
            statIsFileCtor: stat.isFile.constructor,
            direntCtor: entries[0].constructor,
            sanitizeCtor: sanitizeHtml.constructor,
            bufferType: typeof Buffer,
            content: fs.readFileSync('data.txt', 'utf8'),
            hash: crypto.createHash('sha256').update('x').digest('hex')
          };
        }
      };
    `
  }, root => {
    const mod = _internals.loadModuleSandboxed(path.join(root, 'index.js'));
    const result = mod.inspect();

    assert.strictEqual(result.requireCtor, undefined);
    assert.strictEqual(result.pathJoinCtor, undefined);
    assert.strictEqual(result.pathJoinProto, null);
    assert.strictEqual(result.fsReadCtor, undefined);
    assert.strictEqual(result.statCtor, undefined);
    assert.strictEqual(result.statIsFileCtor, undefined);
    assert.strictEqual(result.direntCtor, undefined);
    assert.strictEqual(result.sanitizeCtor, undefined);
    assert.strictEqual(result.bufferType, 'undefined');
    assert.strictEqual(result.content, 'inside');
    assert.strictEqual(result.hash.length, 64);
  });
});

test('module loader sandbox refuses binary fs reads that would expose host buffers', () => {
  withTempModule({
    'data.txt': 'inside',
    'index.js': `
      const fs = require('fs');
      module.exports = {
        readWithoutEncoding() {
          return fs.readFileSync('data.txt');
        }
      };
    `
  }, root => {
    const mod = _internals.loadModuleSandboxed(path.join(root, 'index.js'));
    assert.throws(() => mod.readWithoutEncoding(), /explicit text encoding/);
  });
});

test('module loader sandbox hides service env by default', () => {
  withEnv({
    OPENAI_API_KEY: 'secret-openai',
    BRAVE_API_KEY: 'secret-brave'
  }, () => {
    withTempModule({
      'index.js': `
        module.exports = {
          openai: process.env.OPENAI_API_KEY || null,
          brave: process.env.BRAVE_API_KEY || null
        };
      `
    }, root => {
      const mod = _internals.loadModuleSandboxed(path.join(root, 'index.js'));

      assert.strictEqual(mod.openai, null);
      assert.strictEqual(mod.brave, null);
      assert.deepStrictEqual({ ..._internals.buildSandboxEnv(root) }, {});
    });
  });
});

test('module loader sandbox exposes service env only for declared services', () => {
  withEnv({
    OPENAI_API_KEY: 'secret-openai',
    BRAVE_API_KEY: 'secret-brave',
    GROK_API_KEY: 'secret-grok'
  }, () => {
    withTempModule({
      'apiDefinition.json': JSON.stringify({
        services: ['openai', { provider: 'brave' }]
      }),
      'index.js': `
        module.exports = {
          openai: process.env.OPENAI_API_KEY || null,
          brave: process.env.BRAVE_API_KEY || null,
          grok: process.env.GROK_API_KEY || null
        };
      `
    }, root => {
      const mod = _internals.loadModuleSandboxed(path.join(root, 'index.js'));

      assert.strictEqual(mod.openai, 'secret-openai');
      assert.strictEqual(mod.brave, 'secret-brave');
      assert.strictEqual(mod.grok, null);
      assert.deepStrictEqual({ ..._internals.buildSandboxEnv(root) }, {
        OPENAI_API_KEY: 'secret-openai',
        BRAVE_API_KEY: 'secret-brave'
      });
    });
  });
});

test('module loader sandbox rejects non-object apiDefinition metadata', () => {
  withTempModule({
    'apiDefinition.json': '[]',
    'index.js': 'module.exports = {};'
  }, root => {
    assert.throws(
      () => _internals.loadModuleSandboxed(path.join(root, 'index.js')),
      /apiDefinition\.json must be a JSON object/
    );
  });
});

test('module loader rejects app manifests inside module folders', () => {
  withTempModule({
    'index.js': 'module.exports = { initialize() {} };',
    'moduleInfo.json': JSON.stringify({
      moduleName: 'mixedModule',
      version: '1.0.0',
      developer: 'Test',
      description: 'Wrong shape'
    }),
    'app.json': JSON.stringify({ name: 'mixedModule' })
  }, root => {
    assert.throws(
      () => _internals.assertCommunityModuleFolderShape(root, 'mixedModule'),
      /app\.json/
    );
  });
});

test('module loader rejects nested app, widget and module manifests inside module folders', () => {
  withTempModule({
    'index.js': 'module.exports = { initialize() {} };',
    'moduleInfo.json': JSON.stringify({
      moduleName: 'nestedAppModule',
      version: '1.0.0',
      developer: 'Test',
      description: 'Wrong shape'
    }),
    'embedded-app/app.json': JSON.stringify({ name: 'embedded-app' })
  }, root => {
    assert.throws(
      () => _internals.assertCommunityModuleFolderShape(root, 'nestedAppModule'),
      /app\.json/
    );
  });

  withTempModule({
    'index.js': 'module.exports = { initialize() {} };',
    'moduleInfo.json': JSON.stringify({
      moduleName: 'nestedWidgetModule',
      version: '1.0.0',
      developer: 'Test',
      description: 'Wrong shape'
    }),
    'embedded-widget/widgetInfo.json': JSON.stringify({
      widgetId: 'embedded-widget',
      widgetType: 'public'
    })
  }, root => {
    assert.throws(
      () => _internals.assertCommunityModuleFolderShape(root, 'nestedWidgetModule'),
      /widgetInfo\.json/
    );
  });

  withTempModule({
    'index.js': 'module.exports = { initialize() {} };',
    'moduleInfo.json': JSON.stringify({
      moduleName: 'nestedModuleModule',
      version: '1.0.0',
      developer: 'Test',
      description: 'Wrong shape'
    }),
    'embedded-module/moduleInfo.json': JSON.stringify({
      moduleName: 'embedded-module'
    })
  }, root => {
    assert.throws(
      () => _internals.assertCommunityModuleFolderShape(root, 'nestedModuleModule'),
      /nested moduleInfo\.json/
    );
  });
});

test('module loader rejects package managers and dependency lockfiles inside module folders', () => {
  withTempModule({
    'index.js': 'module.exports = { initialize() {} };',
    'moduleInfo.json': JSON.stringify({
      moduleName: 'packagedModule',
      version: '1.0.0',
      developer: 'Test',
      description: 'Wrong shape'
    }),
    'package.json': JSON.stringify({ scripts: { postinstall: 'node setup.js' } })
  }, root => {
    assert.throws(
      () => _internals.assertCommunityModuleFolderShape(root, 'packagedModule'),
      /package\.json/
    );
  });

  withTempModule({
    'index.js': 'module.exports = { initialize() {} };',
    'moduleInfo.json': JSON.stringify({
      moduleName: 'lockedModule',
      version: '1.0.0',
      developer: 'Test',
      description: 'Wrong shape'
    }),
    'nested/pnpm-lock.yaml': ''
  }, root => {
    assert.throws(
      () => _internals.assertCommunityModuleFolderShape(root, 'lockedModule'),
      /pnpm-lock\.yaml/
    );
  });

  withTempModule({
    'index.js': 'module.exports = { initialize() {} };',
    'moduleInfo.json': JSON.stringify({
      moduleName: 'secretModule',
      version: '1.0.0',
      developer: 'Test',
      description: 'Wrong shape'
    }),
    'frontend/.env.production': 'TOKEN=never-serve-this'
  }, root => {
    assert.throws(
      () => _internals.assertCommunityModuleFolderShape(root, 'secretModule'),
      /\.env\.production/
    );
  });

  withTempModule({
    'index.js': 'module.exports = { initialize() {} };',
    'moduleInfo.json': JSON.stringify({
      moduleName: 'npmrcModule',
      version: '1.0.0',
      developer: 'Test',
      description: 'Wrong shape'
    }),
    '.npmrc': '//registry.example.test/:_authToken=secret'
  }, root => {
    assert.throws(
      () => _internals.assertCommunityModuleFolderShape(root, 'npmrcModule'),
      /\.npmrc/
    );
  });
});

test('module loader rejects host folders and node_modules inside module folders', () => {
  withTempModule({
    'index.js': 'module.exports = { initialize() {} };',
    'moduleInfo.json': JSON.stringify({
      moduleName: 'nodeRuntimeModule',
      version: '1.0.0',
      developer: 'Test',
      description: 'Wrong shape'
    }),
    'node_modules/pkg/index.js': 'module.exports = {};'
  }, root => {
    assert.throws(
      () => _internals.assertCommunityModuleFolderShape(root, 'nodeRuntimeModule'),
      /runtime dependency folder "node_modules"/
    );
  });

  withTempModule({
    'index.js': 'module.exports = { initialize() {} };',
    'moduleInfo.json': JSON.stringify({
      moduleName: 'hostFolderModule',
      version: '1.0.0',
      developer: 'Test',
      description: 'Wrong shape'
    }),
    'apps/embedded/index.html': '<!doctype html>',
    'frontend/public/readme.txt': 'nested public asset is fine'
  }, root => {
    assert.throws(
      () => _internals.assertCommunityModuleFolderShape(root, 'hostFolderModule'),
      /host folder "apps"/
    );
  });

  withTempModule({
    'index.js': 'module.exports = { initialize() {} };',
    'moduleInfo.json': JSON.stringify({
      moduleName: 'frontendModule',
      version: '1.0.0',
      developer: 'Test',
      description: 'Frontend assets'
    }),
    'frontend/public/readme.txt': 'nested public asset is fine'
  }, root => {
    assert.doesNotThrow(() => {
      _internals.assertCommunityModuleFolderShape(root, 'frontendModule');
    });
  });
});

test('module loader requires moduleInfo identity to match direct module folders', () => {
  withTempModule({
    'index.js': 'module.exports = { initialize() {} };'
  }, root => {
    assert.throws(
      () => _internals.readCommunityModuleInfo(root, 'missingInfoModule'),
      /must include moduleInfo\.json/
    );
  });

  withTempModule({
    'index.js': 'module.exports = { initialize() {} };',
    'moduleInfo.json': JSON.stringify({
      moduleName: 'otherModule',
      version: '1.0.0',
      developer: 'Test',
      description: 'Wrong identity'
    })
  }, root => {
    assert.throws(
      () => _internals.readCommunityModuleInfo(root, 'directModule'),
      /does not match folder "directModule"/
    );
  });

  withTempModule({
    'index.js': 'module.exports = { initialize() {} };',
    'moduleInfo.json': JSON.stringify({
      moduleName: 'bad.module',
      version: '1.0.0',
      developer: 'Test',
      description: 'Invalid folder identity'
    })
  }, root => {
    assert.throws(
      () => _internals.readCommunityModuleInfo(root, 'bad.module'),
      /Invalid community module name/
    );
  });

  withTempModule({
    'index.js': 'module.exports = { initialize() {} };',
    'moduleInfo.json': JSON.stringify({
      moduleName: 'bad module',
      version: '1.0.0',
      developer: 'Test',
      description: 'Invalid manifest identity'
    })
  }, root => {
    assert.throws(
      () => _internals.readCommunityModuleInfo(root, 'badModule'),
      /Invalid community module name/
    );
  });

  withTempModule({
    'index.js': 'module.exports = { initialize() {} };',
    'moduleInfo.json': JSON.stringify({
      moduleName: 'coreClaimModule',
      moduleType: 'core',
      version: '1.0.0',
      developer: 'Test',
      description: 'Wrong role'
    })
  }, root => {
    assert.throws(
      () => _internals.readCommunityModuleInfo(root, 'coreClaimModule'),
      /moduleType.*community.*omitted/i
    );
  });

  withTempModule({
    'index.js': 'module.exports = { initialize() {} };',
    'moduleInfo.json': JSON.stringify({
      moduleName: 'widgetClaimModule',
      widgetId: 'heroWidget',
      version: '1.0.0',
      developer: 'Test',
      description: 'Wrong taxonomy'
    })
  }, root => {
    assert.throws(
      () => _internals.readCommunityModuleInfo(root, 'widgetClaimModule'),
      /cannot declare widgetId/
    );
  });

  withTempModule({
    'index.js': 'module.exports = { initialize() {} };',
    'moduleInfo.json': JSON.stringify({
      moduleName: 'appClaimModule',
      appName: 'toolApp',
      version: '1.0.0',
      developer: 'Test',
      description: 'Wrong taxonomy'
    })
  }, root => {
    assert.throws(
      () => _internals.readCommunityModuleInfo(root, 'appClaimModule'),
      /cannot declare appName/
    );
  });

  withTempModule({
    'index.js': 'module.exports = { initialize() {} };',
    'moduleInfo.json': JSON.stringify({
      moduleName: 'designer',
      moduleType: 'community',
      version: '1.0.0',
      developer: 'Test',
      description: 'Reserved identity'
    })
  }, root => {
    assert.throws(
      () => _internals.readCommunityModuleInfo(root, 'designer'),
      /owned by the core/
    );
  });

  withTempModule({
    'index.js': 'module.exports = { initialize() {} };',
    'moduleInfo.json': JSON.stringify({
      moduleName: 'directModule',
      version: '1.0.0'
    })
  }, root => {
    assert.deepStrictEqual(_internals.readCommunityModuleInfo(root, 'directModule'), {
      moduleName: 'directModule',
      version: '1.0.0',
      developer: 'Unknown Developer',
      description: ''
    });
  });
});

test('module loader rejects symlinks and realpath escapes inside module folders', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-module-shape-'));
  const modulesRoot = path.join(tmpRoot, 'modules');
  const moduleDir = path.join(modulesRoot, 'linkedModule');
  const outsideDir = path.join(tmpRoot, 'outside-assets');
  const insideDir = path.join(moduleDir, 'assets');
  fs.mkdirSync(insideDir, { recursive: true });
  fs.mkdirSync(outsideDir, { recursive: true });
  fs.writeFileSync(path.join(moduleDir, 'index.js'), 'module.exports = { initialize() {} };');
  fs.writeFileSync(path.join(moduleDir, 'moduleInfo.json'), JSON.stringify({
    moduleName: 'linkedModule',
    version: '1.0.0',
    developer: 'Test',
    description: 'Wrong shape'
  }));

  try {
    try {
      fs.symlinkSync(outsideDir, path.join(insideDir, 'linked-assets'), process.platform === 'win32' ? 'junction' : 'dir');
    } catch {
      return;
    }

    assert.throws(
      () => _internals.assertCommunityModuleFolderShape(moduleDir, 'linkedModule', { modulesRoot }),
      /symlinks or junctions/
    );

    const linkedModuleDir = path.join(modulesRoot, 'linkedModuleRoot');
    fs.symlinkSync(outsideDir, linkedModuleDir, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(
      () => _internals.assertCommunityModuleFolderShape(linkedModuleDir, 'linkedModuleRoot', { modulesRoot }),
      /symlinks or junctions|escapes modules root/
    );
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('module loader serves legacy Grapes frontend through bounded module static rules', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-module-grapes-'));
  const modulesRoot = path.join(tmpRoot, 'modules');
  const moduleDir = path.join(modulesRoot, 'grapesModule');
  const frontendDir = path.join(moduleDir, 'frontend');
  const mounts = [];
  const app = {
    use(mountPath, handler) {
      mounts.push({ mountPath, handler });
    }
  };
  fs.mkdirSync(frontendDir, { recursive: true });
  fs.writeFileSync(path.join(moduleDir, 'index.js'), 'module.exports = { initialize() {} };');
  fs.writeFileSync(path.join(moduleDir, 'moduleInfo.json'), JSON.stringify({
    moduleName: 'grapesModule',
    version: '1.0.0',
    developer: 'Test',
    description: 'Legacy frontend'
  }));
  fs.writeFileSync(path.join(frontendDir, 'view.html'), '<div>Frontend</div>');

  try {
    const result = _internals.serveLegacyGrapesFrontend({
      row: {
        module_name: 'grapesModule',
        is_active: true,
        moduleInfo: { grapesComponent: true }
      },
      folderNames: ['grapesModule'],
      modulesPath: modulesRoot,
      app
    });

    assert.strictEqual(result.moduleName, 'grapesModule');
    assert.strictEqual(result.mountPath, '/modules/grapesModule');
    assert.strictEqual(result.dir, frontendDir);
    assert.strictEqual(mounts.length, 1);
    assert.strictEqual(mounts[0].mountPath, '/modules/grapesModule');
    assert.strictEqual(typeof mounts[0].handler, 'function');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('module loader rejects unsafe legacy Grapes frontend registry names', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-module-grapes-'));
  const modulesRoot = path.join(tmpRoot, 'modules');
  fs.mkdirSync(modulesRoot, { recursive: true });

  try {
    assert.throws(
      () => _internals.serveLegacyGrapesFrontend({
        row: {
          module_name: '../bad',
          is_active: true,
          moduleInfo: { grapesComponent: true }
        },
        folderNames: ['../bad'],
        modulesPath: modulesRoot,
        app: { use() {} }
      }),
      /Invalid module name/
    );
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('dummy community module initializes through the scoped health-check host', async () => {
  const modulePath = path.resolve(__dirname, '../modules/dummyModule/index.js');
  const mod = _internals.loadModuleSandboxed(modulePath);
  let markedReady = false;
  const host = createCommunityHealthCheckHost({
    moduleName: 'dummyModule',
    moduleDir: path.dirname(modulePath),
    jwt: 'module-token',
    nonce: 'nonce-1',
    markEvent(eventName) {
      if (eventName === 'dummyModule.ready') markedReady = true;
    }
  });

  await mod.initialize({
    motherEmitter: host.eventBus,
    eventBus: host.eventBus,
    moduleHost: host,
    moduleInfo: { moduleName: 'dummyModule' }
  });

  assert.strictEqual(markedReady, true);
});
