const assert = require('assert');

const registry = require('../mother/modules/runtimeManager/facades/registry');

const expectedResources = Object.freeze({
  content: ['comments', 'content', 'contentTypes', 'exporters', 'importers', 'media', 'metadata', 'preview', 'search', 'workflow'],
  presentation: ['colors', 'designer', 'fontPackages', 'fonts', 'navigation', 'pages', 'plainSpace', 'redirects', 'seo', 'sitePresets', 'translations', 'widgets'],
  access: ['auth', 'permissions', 'roles', 'users'],
  platform: ['apps', 'modules', 'notifications', 'serverLocations', 'settings', 'shares', 'unifiedSettings']
});

test('runtime facade resources have one stable domain owner', () => {
  const { domains, resourceDomainIndex, adminResourceIndex } = registry._internals;

  assert.deepStrictEqual(domains.map(domain => domain.name), [
    'content',
    'presentation',
    'access',
    'platform'
  ]);

  for (const domain of domains) {
    assert(Object.isFrozen(domain.adminActions));
    assert.deepStrictEqual(
      Object.keys(domain.adminActions).sort(),
      expectedResources[domain.name]
    );
  }

  const expectedInventory = Object.values(expectedResources).flat().sort();
  assert.deepStrictEqual(Object.keys(adminResourceIndex).sort(), expectedInventory);
  assert.strictEqual(resourceDomainIndex.pages.name, 'presentation');
  assert.strictEqual(resourceDomainIndex.users.name, 'access');
  assert.strictEqual(registry.resolveAdminDomain('content', 'list').domain.name, 'content');
  assert.strictEqual(registry.resolveAdminDomain('designer', 'save').domain.name, 'presentation');
  assert.strictEqual(registry.resolveAdminDomain('users', 'me').domain.name, 'access');
  assert.strictEqual(registry.resolveAdminDomain('modules', 'registry').domain.name, 'platform');
});

test('runtime facade registry preserves public definitions and reverse admin lookup', () => {
  const publicPage = registry.publicRuntimeDefinition('pages', 'getBySlug');
  assert.deepStrictEqual(publicPage.definition, {
    eventName: 'getPageBySlug',
    moduleName: 'pagesManager'
  });
  assert.strictEqual(registry.resolvePublicDomain('pages', 'getBySlug').domain.name, 'presentation');
  assert.strictEqual(registry.resolvePublicDomain('users', 'register').domain.name, 'access');
  assert.strictEqual(registry.resolvePublicDomain('settings', 'public').domain.name, 'platform');

  const reverse = registry.adminApiEventDefinition('designer.saveDesign');
  assert.strictEqual(reverse.resource, 'designer');
  assert.strictEqual(reverse.action, 'save');
  assert.strictEqual(reverse.definition.permission, 'builder.publish');
});

test('runtime facade domain lookups remain fail closed', () => {
  assert.strictEqual(registry.adminApiDefinition('unknown/resource', 'list').definition, null);
  assert.strictEqual(registry.publicRuntimeDefinition('pages', 'unknown/action').definition, null);
  assert.strictEqual(registry.resolveAdminDomain('unknown', 'list').domain, null);
  assert.strictEqual(registry.resolvePublicDomain('content', 'list').definition, null);
});
