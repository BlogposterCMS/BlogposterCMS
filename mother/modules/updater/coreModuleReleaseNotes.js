'use strict';

const fs = require('fs');
const path = require('path');

const MAX_RELEASE_NOTES_BYTES = 32 * 1024;

/** Read only this module's release section; the manifest signs the result. */
function readModuleReleaseNotes(moduleDir, version, changelogName = 'CHANGELOG.md') {
  if (path.basename(changelogName) !== changelogName) throw new Error('CORE_MODULE_CHANGELOG_INVALID');
  const filename = path.join(moduleDir, changelogName);
  if (!fs.existsSync(filename)) return {};
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) {
    throw Object.assign(new Error('CORE_MODULE_CHANGELOG_INVALID'), { code: 'CORE_MODULE_CHANGELOG_INVALID' });
  }
  const sections = fs.readFileSync(filename, 'utf8').split(/^##\s+/m).slice(1);
  const title = section => section.split(/\r?\n/, 1)[0].trim();
  const matches = label => sections.find(section => title(section) === `[${label}]` || title(section).startsWith(`[${label}] - `));
  const section = matches(version) || matches('Unreleased');
  if (!section) return {};
  const releaseNotes = section.slice(section.indexOf('\n') + 1).trim();
  if (Buffer.byteLength(releaseNotes, 'utf8') > MAX_RELEASE_NOTES_BYTES) {
    throw Object.assign(new Error('CORE_MODULE_CHANGELOG_TOO_LARGE'), { code: 'CORE_MODULE_CHANGELOG_TOO_LARGE' });
  }
  return releaseNotes ? { releaseNotes, breakingChange: /^###\s+Breaking changes\s*$/mi.test(releaseNotes) } : {};
}

module.exports = { readModuleReleaseNotes, MAX_RELEASE_NOTES_BYTES };
