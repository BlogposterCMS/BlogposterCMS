const fs = require('fs');
const path = require('path');

const WIDGET_DESIGN_CONTRACT_VERSION = 1;
const STRICT_WIDGET_SOURCE_PREFIX = '/ui/widgets/plainspace/';
const COMMUNITY_WIDGET_SOURCE_PREFIX = '/widgets/';
const SCRIPT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);

const ISSUE = Object.freeze({
  TRUSTED_SOURCE: 'BP_WIDGET_CONTRACT_TRUSTED_SOURCE',
  VERSION: 'BP_WIDGET_CONTRACT_VERSION',
  RAW_COLOR: 'BP_WIDGET_CONTRACT_RAW_COLOR',
  GLOBAL_STYLE: 'BP_WIDGET_CONTRACT_GLOBAL_STYLE',
  TOKEN_MISSING: 'BP_WIDGET_CONTRACT_TOKEN_MISSING'
});

function parseJsonObject(value) {
  if (!value || typeof value !== 'string') return null;
  const source = value.trim();
  if (!source || !source.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(source);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeContract(contract) {
  if (!contract) return null;
  if (contract === 'v1' || contract === 1) {
    return { version: WIDGET_DESIGN_CONTRACT_VERSION };
  }
  if (typeof contract === 'object' && !Array.isArray(contract)) {
    return {
      ...contract,
      version: Number(contract.version || contract.v || 0)
    };
  }
  return null;
}

function extractWidgetContent(content) {
  if (content && typeof content === 'object' && !Array.isArray(content)) {
    return { kind: 'inline', value: content };
  }
  const source = String(content || '').trim();
  const inline = parseJsonObject(source);
  if (inline) return { kind: 'inline', value: inline };
  return { kind: 'url', value: source };
}

function extractDesignContract(widget = {}, contentDescriptor = extractWidgetContent(widget.content)) {
  const metadataContract = normalizeContract(widget.metadata?.designContract);
  if (metadataContract) return metadataContract;
  if (contentDescriptor.kind === 'inline') {
    return normalizeContract(contentDescriptor.value?.metadata?.designContract);
  }
  return null;
}

function isGeneratedWidget(widget = {}) {
  const source = String(
    widget.designSource ||
    widget.generatedBy ||
    widget.metadata?.designSource ||
    widget.metadata?.generatedBy ||
    ''
  ).toLowerCase();
  return ['designer', 'builder', 'ai', 'generated'].includes(source);
}

function resolveWidgetDesignPolicy(widget = {}) {
  const contentDescriptor = extractWidgetContent(widget.content);
  const contract = extractDesignContract(widget, contentDescriptor);
  const contractMode = String(contract?.mode || '').toLowerCase();
  if (contractMode === 'strict' || contractMode === 'advisory') return contractMode;
  if (widget.enforceDesignContract === true || isGeneratedWidget(widget)) return 'strict';
  if (widget.widgetType === 'admin' || widget.category === 'core') return 'strict';
  if (contentDescriptor.kind === 'url') {
    if (contentDescriptor.value.startsWith(STRICT_WIDGET_SOURCE_PREFIX)) return 'strict';
    if (contentDescriptor.value.startsWith(COMMUNITY_WIDGET_SOURCE_PREFIX)) return 'advisory';
  }
  return 'advisory';
}

function issue(code, message, severity = 'warning', extra = {}) {
  return { code, message, severity, ...extra };
}

function appendInlineSourceParts(target, value) {
  if (!value || typeof value !== 'object') return;
  for (const key of ['html', 'css', 'js', 'content', 'style']) {
    if (typeof value[key] === 'string') target.push(value[key]);
  }
}

function inlineSourceFromContent(contentDescriptor) {
  if (contentDescriptor.kind !== 'inline') return '';
  const parts = [];
  appendInlineSourceParts(parts, contentDescriptor.value);
  return parts.join('\n');
}

function sourceLooksStyled(source) {
  return /(?:<style\b|\.style\s*\.|style\s*=|[{;]\s*[-a-zA-Z]+\s*:)/i.test(source);
}

function scanWidgetDesignSource(source = '', options = {}) {
  const text = String(source || '');
  const issues = [];
  if (!text.trim()) return issues;

  if (/(?:#[0-9a-f]{3,8}\b|rgba?\s*\(|hsla?\s*\()/i.test(text)) {
    issues.push(issue(
      ISSUE.RAW_COLOR,
      'Use Blogposter design tokens such as var(--...) instead of raw color literals.'
    ));
  }

  if (/\bdocument\s*\.\s*(?:body|documentElement)\s*\.\s*style\b/.test(text)) {
    issues.push(issue(
      ISSUE.GLOBAL_STYLE,
      'Widget code must not mutate body or documentElement styles; keep styling scoped to the widget shell.'
    ));
  }

  if (options.requireTokens && sourceLooksStyled(text) && !/var\s*\(\s*--/.test(text)) {
    issues.push(issue(
      ISSUE.TOKEN_MISSING,
      'Styled strict widgets must reference Blogposter design tokens with CSS variables.'
    ));
  }

  return issues;
}

function validateWidgetDesignContract(widget = {}, options = {}) {
  const contentDescriptor = extractWidgetContent(widget.content);
  const policy = options.policy || resolveWidgetDesignPolicy(widget);
  const contract = extractDesignContract(widget, contentDescriptor);
  const errors = [];
  const warnings = [];

  if (policy === 'strict') {
    if (contentDescriptor.kind === 'url') {
      if (!contentDescriptor.value.startsWith(STRICT_WIDGET_SOURCE_PREFIX)) {
        errors.push(issue(
          ISSUE.TRUSTED_SOURCE,
          'Strict widgets must load from /ui/widgets/plainspace/ or provide inline content with a v1 design contract.',
          'error'
        ));
      }
    } else if (contract?.version !== WIDGET_DESIGN_CONTRACT_VERSION) {
      errors.push(issue(
        ISSUE.VERSION,
        'Inline strict widgets must declare metadata.designContract.version = 1.',
        'error'
      ));
    }
  }

  const inlineSource = inlineSourceFromContent(contentDescriptor);
  const scanSource = [inlineSource, options.sourceCode || ''].filter(Boolean).join('\n');
  const sourceIssues = scanWidgetDesignSource(scanSource, {
    requireTokens: policy === 'strict'
  });
  for (const found of sourceIssues) {
    if (policy === 'strict' && [ISSUE.GLOBAL_STYLE, ISSUE.TOKEN_MISSING].includes(found.code)) {
      errors.push({ ...found, severity: 'error' });
    } else {
      warnings.push(found);
    }
  }

  return {
    ok: errors.length === 0,
    policy,
    errors,
    warnings
  };
}

function isScriptFile(filename = '') {
  return SCRIPT_EXTENSIONS.has(path.extname(String(filename || '')).toLowerCase());
}

function validateCommunityWidgetDesignContract(widgetDir, folderName = '') {
  const warnings = [];
  const stack = [widgetDir];
  while (stack.length) {
    const currentDir = stack.pop();
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }
      if (!entry.isFile() || !isScriptFile(entry.name)) {
        continue;
      }
      const relativePath = path.relative(widgetDir, entryPath).replace(/\\/g, '/');
      const source = fs.readFileSync(entryPath, 'utf8');
      for (const found of scanWidgetDesignSource(source)) {
        warnings.push({
          ...found,
          file: relativePath,
          message: `${found.message} (${folderName}/${relativePath})`
        });
      }
    }
  }
  return {
    ok: true,
    policy: 'advisory',
    errors: [],
    warnings
  };
}

function formatWidgetDesignContractIssues(report = {}) {
  return [...(report.errors || []), ...(report.warnings || [])]
    .map(item => `${item.code}: ${item.message}`)
    .join('; ');
}

module.exports = {
  ISSUE,
  WIDGET_DESIGN_CONTRACT_VERSION,
  STRICT_WIDGET_SOURCE_PREFIX,
  COMMUNITY_WIDGET_SOURCE_PREFIX,
  extractWidgetContent,
  formatWidgetDesignContractIssues,
  resolveWidgetDesignPolicy,
  scanWidgetDesignSource,
  validateCommunityWidgetDesignContract,
  validateWidgetDesignContract
};
