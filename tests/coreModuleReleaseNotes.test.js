'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { readModuleReleaseNotes } = require('../mother/modules/updater/coreModuleReleaseNotes');
const { parseManifest } = require('../mother/modules/updater/coreModulePackages');
const { createFixture } = require('./helpers/coreModuleFixture');

let directory;
beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'module-notes-')); });
afterEach(() => { fs.rmSync(directory, { recursive: true, force: true }); });
const write = text => fs.writeFileSync(path.join(directory, 'CHANGELOG.md'), text);

test('selects exact release notes without mixing future or historical changes', () => {
  write('# Module\n\n## [Unreleased]\nFuture\n## [0.10.10] - 2026-09-09\nSelected\n## [0.10.9]\nOlder');
  expect(readModuleReleaseNotes(directory, '0.10.10')).toEqual({ releaseNotes: 'Selected', breakingChange: false });
});

test('packages explicitly pending changes and recognizes only an explicit breaking heading', () => {
  write('# Module\n## [Unreleased]\n### Breaking changes\nChanged API.');
  expect(readModuleReleaseNotes(directory, '0.10.10')).toEqual({ releaseNotes: '### Breaking changes\nChanged API.', breakingChange: true });
  write('# Module\n## [Unreleased]\nNo breaking changes.');
  expect(readModuleReleaseNotes(directory, '0.10.10').breakingChange).toBe(false);
});

test('missing notes remain absent instead of borrowing the overall product changelog', () => {
  expect(readModuleReleaseNotes(directory, '0.10.10')).toEqual({});
  write('# Module\n## [0.10.9]\nOlder');
  expect(readModuleReleaseNotes(directory, '0.10.10')).toEqual({});
});

test('rejects excessive release text before publishing a package', () => {
  write('# Module\n## [Unreleased]\n' + 'a'.repeat(32769));
  expect(() => readModuleReleaseNotes(directory, '0.10.10')).toThrow('CORE_MODULE_CHANGELOG_TOO_LARGE');
});

test.each([{ releaseNotes: {} }, { releaseNotes: 'a'.repeat(32769) }, { breakingChange: 'false' }])('rejects malformed signed review metadata', metadata => {
  const fixture = createFixture();
  try {
    expect(() => parseManifest(JSON.stringify({ ...fixture.manifest, ...metadata }), 'translationManager'))
      .toThrow('CORE_MODULE_RELEASE_NOTES_INVALID');
  } finally { fs.rmSync(fixture.directory, { recursive: true, force: true }); }
});
