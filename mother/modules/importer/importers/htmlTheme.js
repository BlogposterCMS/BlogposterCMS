'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_THEMES_DIR = path.resolve(__dirname, '../../../../public/themes');
const MAX_SCAN_FILES = 1000;
const EXECUTABLE_EXTENSIONS = new Set([
  '.asp',
  '.aspx',
  '.cjs',
  '.jsx',
  '.jsp',
  '.mjs',
  '.php',
  '.phtml',
  '.py',
  '.rb',
  '.sh',
  '.ts',
  '.tsx',
  '.vue',
  '.svelte'
]);
const REMOTE_URL_PATTERN = /\b(?:https?:)?\/\//i;
const UNSAFE_URL_PATTERN = /\b(?:javascript|data|vbscript):/i;

function normalizeSlug(raw, fallback = 'imported-theme') {
  const slug = String(raw || fallback)
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || fallback;
}

function toPosix(relativePath) {
  return String(relativePath || '').replace(/\\/g, '/');
}

function ensureInside(parent, target) {
  const resolvedParent = path.resolve(parent);
  const resolvedTarget = path.resolve(target);
  if (resolvedTarget !== resolvedParent && !resolvedTarget.startsWith(resolvedParent + path.sep)) {
    throw new Error(`Target path escapes expected directory: ${resolvedTarget}`);
  }
  return resolvedTarget;
}

async function pathExists(target) {
  try {
    await fs.promises.access(target, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readMaybe(filePath) {
  try {
    return await fs.promises.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

async function scanDirectory(sourceDir, rootDir = sourceDir, files = []) {
  const entries = await fs.promises.readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    if (files.length >= MAX_SCAN_FILES) break;
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const absolutePath = path.join(sourceDir, entry.name);
    if (entry.isDirectory()) {
      await scanDirectory(absolutePath, rootDir, files);
      continue;
    }
    if (!entry.isFile()) continue;
    const stat = await fs.promises.stat(absolutePath);
    const relativePath = toPosix(path.relative(rootDir, absolutePath));
    const ext = path.extname(entry.name).toLowerCase();
    files.push({
      relativePath,
      sizeBytes: stat.size,
      extension: ext,
      type: classifyFile(ext)
    });
  }
  return files;
}

function classifyFile(ext) {
  if (ext === '.html' || ext === '.htm') return 'html';
  if (ext === '.css') return 'css';
  if (ext === '.js' || ext === '.mjs') return 'script';
  if (EXECUTABLE_EXTENSIONS.has(ext)) return 'code';
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico'].includes(ext)) return 'image';
  if (['.woff', '.woff2', '.ttf', '.otf', '.eot'].includes(ext)) return 'font';
  if (['.mp4', '.webm', '.mov', '.mp3', '.wav', '.ogg'].includes(ext)) return 'media';
  return 'asset';
}

function extractHtmlTitle(html) {
  const match = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].replace(/\s+/g, ' ').trim() : '';
}

function extractHtmlReferences(html) {
  const refs = [];
  const source = String(html || '');
  const patterns = [
    /<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi,
    /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi,
    /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      refs.push(match[1]);
    }
  }
  return refs
    .filter(ref => ref && !/^(https?:)?\/\//i.test(ref) && !/^data:/i.test(ref))
    .map(ref => ref.split('#')[0].split('?')[0])
    .filter(Boolean);
}

function addUniqueBlock(blocked, code, file, detail) {
  const message = `${code}: ${file}${detail ? ` - ${detail}` : ''}`;
  if (!blocked.includes(message)) blocked.push(message);
}

function inspectHtmlThemePolicy(files, htmlByPath, cssByPath) {
  const blocked = [];
  const warnings = [];

  for (const file of files) {
    if (file.type === 'script') {
      addUniqueBlock(blocked, 'THEME_SCRIPT_FILE', file.relativePath, 'themes cannot ship JavaScript files');
    }
    if (file.type === 'code') {
      addUniqueBlock(blocked, 'THEME_EXECUTABLE_FILE', file.relativePath, 'themes cannot ship executable source files');
    }
  }

  for (const [relativePath, html] of Object.entries(htmlByPath)) {
    if (/<script\b/i.test(html)) {
      addUniqueBlock(blocked, 'THEME_SCRIPT_TAG', relativePath, 'script tags belong in widgets, modules or apps');
    }
    if (/\son[a-z]+\s*=/i.test(html)) {
      addUniqueBlock(blocked, 'THEME_INLINE_HANDLER', relativePath, 'inline event handlers are feature logic');
    }
    if (UNSAFE_URL_PATTERN.test(html)) {
      addUniqueBlock(blocked, 'THEME_UNSAFE_URL', relativePath, 'javascript/data/vbscript URLs are not allowed');
    }
    if (REMOTE_URL_PATTERN.test(html)) {
      addUniqueBlock(blocked, 'THEME_REMOTE_REFERENCE', relativePath, 'themes must package presentation assets locally');
    }
  }

  for (const [relativePath, css] of Object.entries(cssByPath)) {
    if (/@import\b/i.test(css)) {
      addUniqueBlock(blocked, 'THEME_CSS_IMPORT', relativePath, 'CSS imports hide external dependencies');
    }
    if (/\burl\(\s*['"]?(?:https?:)?\/\//i.test(css)) {
      addUniqueBlock(blocked, 'THEME_REMOTE_CSS_URL', relativePath, 'CSS may not reference remote assets');
    }
    if (UNSAFE_URL_PATTERN.test(css) || /\bexpression\s*\(/i.test(css) || /\bbehavior\s*:/i.test(css)) {
      addUniqueBlock(blocked, 'THEME_UNSAFE_CSS', relativePath, 'unsafe CSS behavior is not presentation-only');
    }
  }

  if (blocked.length) {
    warnings.push('Theme import blocked because themes are presentation-only packages. Move behavior into widgets, modules or apps.');
  }

  return { blocked, warnings };
}

async function buildImportPlan(options = {}) {
  const rawSourceDir = options.sourceDir || options.dir || options.path;
  if (!rawSourceDir) {
    return {
      source: 'htmlTheme',
      dryRun: true,
      installable: false,
      warnings: ['No theme source directory provided. Pass options.sourceDir.'],
      policy: { blocked: [], warnings: [] },
      theme: {},
      files: [],
      entrypoints: {},
      totals: { files: 0, html: 0, css: 0, scripts: 0, code: 0, images: 0, fonts: 0, assets: 0 }
    };
  }

  const sourceDir = path.resolve(rawSourceDir);
  const stat = await fs.promises.stat(sourceDir);
  if (!stat.isDirectory()) {
    throw new Error(`Theme source is not a directory: ${sourceDir}`);
  }

  const files = await scanDirectory(sourceDir);
  const htmlFiles = files.filter(file => file.type === 'html');
  const cssFiles = files.filter(file => file.type === 'css');
  const scriptFiles = files.filter(file => file.type === 'script');
  const codeFiles = files.filter(file => file.type === 'code');
  const imageFiles = files.filter(file => file.type === 'image');
  const fontFiles = files.filter(file => file.type === 'font');
  const assetFiles = files.filter(file => !['html', 'css', 'script', 'code', 'image', 'font'].includes(file.type));
  const preferredHtml = htmlFiles.find(file => /^index\.html?$/i.test(file.relativePath)) || htmlFiles[0] || null;
  const preferredCss = cssFiles.find(file => /theme\.css$/i.test(file.relativePath)) || cssFiles[0] || null;
  const htmlByPath = {};
  const cssByPath = {};
  for (const file of htmlFiles) {
    htmlByPath[file.relativePath] = await readMaybe(path.join(sourceDir, file.relativePath));
  }
  for (const file of cssFiles) {
    cssByPath[file.relativePath] = await readMaybe(path.join(sourceDir, file.relativePath));
  }
  const html = preferredHtml ? htmlByPath[preferredHtml.relativePath] || '' : '';
  const title = options.themeName || options.name || extractHtmlTitle(html) || path.basename(sourceDir);
  const slug = normalizeSlug(options.themeSlug || options.slug || title);
  const policy = inspectHtmlThemePolicy(files, htmlByPath, cssByPath);
  const warnings = [
    ...(files.length >= MAX_SCAN_FILES ? [`Theme scan stopped after ${MAX_SCAN_FILES} files.`] : []),
    ...policy.warnings
  ];

  return {
    source: 'htmlTheme',
    dryRun: options.dryRun !== false,
    installable: Boolean(preferredHtml || preferredCss) && policy.blocked.length === 0,
    policy,
    sourceDir,
    theme: {
      slug,
      name: title,
      description: options.description || `Imported static HTML theme from ${path.basename(sourceDir)}`,
      version: options.version || '1.0.0'
    },
    entrypoints: {
      html: preferredHtml?.relativePath || '',
      css: preferredCss?.relativePath || ''
    },
    references: extractHtmlReferences(html),
    files,
    totals: {
      files: files.length,
      html: htmlFiles.length,
      css: cssFiles.length,
      scripts: scriptFiles.length,
      code: codeFiles.length,
      images: imageFiles.length,
      fonts: fontFiles.length,
      assets: assetFiles.length
    },
    warnings
  };
}

function themeCss(plan) {
  const css = plan.entrypoints.css;
  if (!css) {
    return [
      '/* Imported HTML theme has no CSS entrypoint. */',
      ':root { --bp-imported-theme: 1; }',
      ''
    ].join('\n');
  }
  return [
    '/* Generated by Blogposter htmlTheme importer. */',
    `@import "./source/${css.replace(/"/g, '\\"')}";`,
    ''
  ].join('\n');
}

async function installTheme(plan, options = {}) {
  const blocked = Array.isArray(plan.policy?.blocked) ? plan.policy.blocked : [];
  if (blocked.length) {
    throw new Error(`Theme import blocked: ${blocked[0]}`);
  }
  if (!plan.installable) {
    throw new Error('Theme import needs at least one HTML or CSS file.');
  }
  const themesBase = ensureInside(
    options.themeBaseDir || DEFAULT_THEMES_DIR,
    options.themeBaseDir || DEFAULT_THEMES_DIR
  );
  const themeDir = ensureInside(themesBase, path.join(themesBase, plan.theme.slug));
  const sourceTarget = ensureInside(themeDir, path.join(themeDir, 'source'));
  const exists = await pathExists(themeDir);

  if (exists && options.overwrite !== true) {
    throw new Error(`Theme already exists: ${plan.theme.slug}. Pass overwrite: true to replace it.`);
  }
  if (exists) {
    ensureInside(themesBase, themeDir);
    await fs.promises.rm(themeDir, { recursive: true, force: true });
  }

  await fs.promises.mkdir(sourceTarget, { recursive: true });
  await fs.promises.cp(plan.sourceDir, sourceTarget, { recursive: true });
  await fs.promises.writeFile(path.join(themeDir, 'theme.css'), themeCss(plan), 'utf8');
  await fs.promises.writeFile(path.join(themeDir, 'theme.json'), JSON.stringify({
    name: plan.theme.name,
    version: plan.theme.version,
    description: plan.theme.description,
    imported: {
      source: 'htmlTheme',
      entrypoints: plan.entrypoints,
      totals: plan.totals,
      policy: plan.policy,
      createdAt: new Date().toISOString()
    }
  }, null, 2), 'utf8');

  return {
    installed: true,
    themeDir,
    slug: plan.theme.slug,
    filesCopied: plan.totals.files
  };
}

module.exports = {
  name: 'htmlTheme',
  description: 'Import a static HTML theme directory.',

  async import(options = {}) {
    const plan = await buildImportPlan(options);
    if (options.dryRun !== false) {
      return { success: true, dryRun: true, plan };
    }
    const installed = await installTheme(plan, options);
    return { success: true, dryRun: false, plan, installed };
  },

  _internals: {
    buildImportPlan,
    classifyFile,
    extractHtmlReferences,
    extractHtmlTitle,
    inspectHtmlThemePolicy,
    installTheme,
    normalizeSlug
  }
};
