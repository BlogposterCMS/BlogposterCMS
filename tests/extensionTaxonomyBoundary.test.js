const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { CORE_OWNED_MODULE_NAMES } = require('../mother/modules/moduleLoader/moduleOwnershipPolicy');

const root = path.resolve(__dirname, '..');
// After the BlogposterCMS root rebaseline, the application root and repository
// documentation root are the same directory.
const repoRoot = root;

function existingPath(...segments) {
  const target = path.join(...segments);
  return fs.existsSync(target) ? target : null;
}

function walkFiles(startDir, files = []) {
  if (!startDir || !fs.existsSync(startDir)) return files;
  for (const entry of fs.readdirSync(startDir, { withFileTypes: true })) {
    const fullPath = path.join(startDir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, files);
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasCoreRegistration(text, identities) {
  const literalIdentities = identities
    .map(identity => `['"]${escapeRegExp(identity)}['"]`)
    .join('|');
  const identityArg = `(?:MODULE_NAME|MANAGER_NAME|MODULE|${literalIdentities})`;
  const typeArg = '(?:MODULE_TYPE|[\'"]core[\'"])';
  return new RegExp(`\\.registerModuleType\\(\\s*${identityArg}\\s*,\\s*${typeArg}\\s*\\)`).test(text);
}

test('core modules have moduleInfo metadata and module docs', () => {
  const modulesDir = path.join(root, 'mother/modules');
  const docsDir = path.join(repoRoot, 'docs/modules');
  const indexDoc = readText(path.join(repoRoot, 'docs/modules.md'));
  const moduleNames = fs.readdirSync(modulesDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();

  assert(moduleNames.length > 0);

  for (const moduleName of moduleNames) {
    const infoPath = path.join(modulesDir, moduleName, 'moduleInfo.json');
    const docPath = path.join(docsDir, `${moduleName}.md`);

    assert(fs.existsSync(infoPath), `${moduleName} is missing moduleInfo.json`);
    assert(fs.existsSync(docPath), `${moduleName} is missing docs/modules/${moduleName}.md`);
    assert(
      indexDoc.includes(`modules/${moduleName}.md`),
      `${moduleName} is missing from docs/modules.md`
    );

    const info = JSON.parse(readText(infoPath));
    assert.strictEqual(info.moduleName, moduleName, `${moduleName} moduleInfo.moduleName mismatch`);
    assert(info.version, `${moduleName} moduleInfo.version missing`);
    assert(info.description, `${moduleName} moduleInfo.description missing`);
  }
});

test('core module entrypoints register their MotherEmitter identity', () => {
  const modulesDir = path.join(root, 'mother/modules');
  const identityAliases = {
    plainSpace: ['plainSpace', 'plainspace']
  };
  const moduleNames = fs.readdirSync(modulesDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();

  for (const moduleName of moduleNames) {
    const indexPath = path.join(modulesDir, moduleName, 'index.js');
    const text = readText(indexPath);
    const identities = identityAliases[moduleName] || [moduleName];

    assert(
      hasCoreRegistration(text, identities),
      `${moduleName} must register its core module identity with MotherEmitter`
    );
  }
});

test('core module initializers do not soft-return on non-core startup', () => {
  const modulesDir = path.join(root, 'mother/modules');
  const violations = [];
  const moduleNames = fs.readdirSync(modulesDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();

  for (const moduleName of moduleNames) {
    const indexPath = path.join(modulesDir, moduleName, 'index.js');
    const text = readText(indexPath);
    const matches = text.matchAll(/if\s*\(!isCore\)\s*\{[\s\S]*?\n\s*\}/g);
    for (const match of matches) {
      if (/\breturn\s*;/.test(match[0])) {
        violations.push(moduleName);
      }
    }
  }

  assert.deepStrictEqual(violations, []);
});

test('public taxonomy uses modules widgets and apps instead of plugins', () => {
  const scanTargets = [
    existingPath(root, 'mother/modules'),
    existingPath(root, 'modules'),
    existingPath(root, 'apps'),
    existingPath(root, 'widgets'),
    existingPath(repoRoot, 'docs')
  ].filter(Boolean);
  const files = scanTargets.flatMap(target => {
    const stat = fs.statSync(target);
    return stat.isDirectory() ? walkFiles(target) : [target];
  });
  const violations = [];

  for (const filePath of files) {
    const text = readText(filePath);
    if (/\bplugins?\b/i.test(text)) {
      violations.push(path.relative(repoRoot, filePath).replace(/\\/g, '/'));
    }
  }

  assert.deepStrictEqual(violations, []);
});

test('community modules do not hardcode direct system access', () => {
  const modulesDir = path.join(root, 'modules');
  const directAccessPatterns = [
    {
      label: 'direct mother module import',
      regex: /require\(\s*['"][^'"]*mother[\\/]+modules[\\/]+/
    },
    {
      label: 'direct system event emit',
      regex: /motherEmitter\.emit\(\s*['"](?:createDatabase|applySchemaDefinition|applySchemaFile|performDbOperation|dbInsert|dbUpdate|dbDelete|httpRequest|cmsAdminApiRequest|ensurePublicToken|issuePublicToken|finalizeUserLogin|publicRegister|userLogin)['"]/
    },
    {
      label: 'host environment access',
      regex: /\bprocess\.env\b/
    },
    {
      label: 'raw Express app access',
      regex: /\bapp\.(?:use|get|post|put|delete|patch|listen)\s*\(/
    }
  ];
  const violations = [];

  if (!fs.existsSync(modulesDir)) {
    assert.deepStrictEqual(violations, []);
    return;
  }

  const moduleNames = fs.readdirSync(modulesDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .filter(moduleName => !CORE_OWNED_MODULE_NAMES.has(moduleName))
    .sort();

  for (const moduleName of moduleNames) {
    const moduleDir = path.join(modulesDir, moduleName);
    const files = walkFiles(moduleDir)
      .filter(filePath => /\.(?:js|cjs|mjs|json)$/.test(filePath));

    for (const filePath of files) {
      const text = readText(filePath);
      for (const { label, regex } of directAccessPatterns) {
        if (regex.test(text)) {
          violations.push(`${path.relative(repoRoot, filePath).replace(/\\/g, '/')} uses ${label}`);
        }
      }
    }
  }

  assert.deepStrictEqual(violations, []);
});

test('module docs document their trust boundary', () => {
  const docsDir = path.join(repoRoot, 'docs/modules');
  const moduleDocs = fs.readdirSync(docsDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => entry.name)
    .sort();

  assert(moduleDocs.length > 0);

  for (const fileName of moduleDocs) {
    const docPath = path.join(docsDir, fileName);
    const text = readText(docPath);
    assert(
      /## Boundaries/.test(text),
      `${fileName} must document its module/widget/app trust boundary`
    );
  }
});
