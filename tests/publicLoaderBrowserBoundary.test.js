'use strict';

const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

// Jest resolves imports that native browser ESM rejects. Inspect both the
// maintained TS and deployed JS independently of Jest's module resolver.
test.each(['designerManager', 'widgetManager'])('%s loader retains the browser facade boundary', moduleName => {
  for (const extension of ['ts', 'js']) {
    const source = fs.readFileSync(path.join(__dirname, '..', 'mother', 'modules', moduleName, `publicLoader.${extension}`), 'utf8');
    const ast = parser.parse(source, { sourceType: 'module', plugins: ['typescript'] });
    const imports = ast.program.body.filter(node => node.type === 'ImportDeclaration').map(node => node.source.value);
    expect(imports).toContain('/ui/shared/api-client/runtimeFacade.js');
    expect(imports.every(specifier => specifier.endsWith('.js'))).toBe(true);
    expect(source).not.toContain('generatedBackendEventCatalog');
    expect(source).not.toContain('require(');
  }
});
