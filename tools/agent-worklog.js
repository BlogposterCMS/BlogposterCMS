'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const WORKLOG_DIR_NAME = '.agent-worklog';
const DEFAULT_STALE_HOURS = 6;
const VALID_ACTIONS = new Set(['start', 'update', 'done', 'list', 'clear']);

function printUsage() {
  return [
    'Usage: node tools/agent-worklog.js <start|update|done|list|clear> [options]',
    '',
    'Options:',
    '  --agent <name>       Human-readable agent label.',
    '  --session <id>       Stable session id for repeat updates.',
    '  --task <summary>     Short non-sensitive task summary.',
    '  --note <summary>     Short non-sensitive progress note.',
    '  --paths <list>       Comma-separated repo paths being touched.',
    '  --path <path>        Add one repo path; can be repeated.',
    '  --root <path>        Repository root override for tests/tools.',
    '  --max-age-hours <n>  Stale cleanup threshold; defaults to 6.'
  ].join('\n');
}

function sanitizeSlug(value, fallback = 'agent') {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || fallback;
}

function redactText(value) {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value)
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, '[REDACTED]')
    .replace(/\b(bp_agent_[A-Za-z0-9_-]+)\b/g, '[REDACTED]')
    .replace(/\b(password|passwd|pwd|secret|token|api[_-]?key)\s*[:=]\s*("[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1=[REDACTED]')
    .replace(/\b(jwt|bearer)\s+[A-Za-z0-9._-]{12,}/gi, '$1 [REDACTED]');
}

function normalizePathForWorklog(rootDir, filePath) {
  const cleanValue = redactText(filePath).trim();
  if (!cleanValue) {
    return '';
  }

  const absolutePath = path.resolve(rootDir, cleanValue);
  const relativePath = path.relative(rootDir, absolutePath);
  if (!relativePath.startsWith('..') && !path.isAbsolute(relativePath)) {
    return relativePath.replace(/\\/g, '/');
  }

  // Keep outside-workspace references useful without leaking full local paths.
  return `[outside-workspace]/${path.basename(cleanValue)}`;
}

function parseList(value) {
  if (!value) {
    return [];
  }
  return String(value)
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);
}

function parseArgs(argv) {
  const options = {
    action: '',
    paths: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (!arg.startsWith('--') && !options.action) {
      options.action = arg;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    const next = argv[index + 1];
    if (arg === '--agent') {
      options.agent = next;
      index += 1;
    } else if (arg === '--session') {
      options.session = next;
      index += 1;
    } else if (arg === '--task') {
      options.task = next;
      index += 1;
    } else if (arg === '--note') {
      options.note = next;
      index += 1;
    } else if (arg === '--paths') {
      options.paths.push(...parseList(next));
      index += 1;
    } else if (arg === '--path') {
      options.paths.push(next);
      index += 1;
    } else if (arg === '--root') {
      options.rootDir = next;
      index += 1;
    } else if (arg === '--max-age-hours') {
      options.maxAgeHours = Number(next);
      index += 1;
    } else {
      throw new Error(`AGENT_WORKLOG_INVALID_OPTION: Unknown option "${arg}".`);
    }
  }

  return options;
}

function getDefaultAgentName(env = process.env) {
  return env.AGENT_NAME || env.CODEX_AGENT_NAME || env.USERNAME || env.USER || os.userInfo().username || 'agent';
}

function createSessionId(agentName, now = new Date(), pid = process.pid) {
  const timestamp = now.toISOString().replace(/[-:.]/g, '').slice(0, 15);
  return `${timestamp}-${sanitizeSlug(agentName)}-${pid}`;
}

function getWorklogDir(rootDir) {
  return path.join(rootDir, WORKLOG_DIR_NAME);
}

function getWorklogFile(rootDir, sessionId) {
  return path.join(getWorklogDir(rootDir), `${sanitizeSlug(sessionId, 'session')}.md`);
}

function ensureWorklogDir(rootDir) {
  fs.mkdirSync(getWorklogDir(rootDir), { recursive: true });
}

function listWorklogFiles(rootDir) {
  const dir = getWorklogDir(rootDir);
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs.readdirSync(dir)
    .filter(fileName => fileName.endsWith('.md'))
    .map(fileName => path.join(dir, fileName))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
}

function getNowMs(now = Date.now()) {
  if (now instanceof Date) {
    return now.getTime();
  }
  if (typeof now === 'number') {
    return now;
  }
  return new Date(now).getTime();
}

function getSafeMaxAgeHours(value) {
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_STALE_HOURS;
}

function findLatestSessionFile(rootDir, agentName) {
  const agentSlug = sanitizeSlug(agentName);
  return listWorklogFiles(rootDir)
    .find(filePath => path.basename(filePath).includes(agentSlug));
}

function clearStaleWorklogs(rootDir, maxAgeHours = DEFAULT_STALE_HOURS, now = Date.now()) {
  const maxAgeMs = getSafeMaxAgeHours(maxAgeHours) * 60 * 60 * 1000;
  const nowMs = getNowMs(now);
  const removed = [];

  for (const filePath of listWorklogFiles(rootDir)) {
    const stat = fs.statSync(filePath);
    if (nowMs - stat.mtimeMs > maxAgeMs) {
      fs.unlinkSync(filePath);
      removed.push(filePath);
    }
  }

  return removed;
}

function formatPaths(rootDir, paths) {
  const safePaths = Array.from(new Set(paths
    .map(filePath => normalizePathForWorklog(rootDir, filePath))
    .filter(Boolean)));

  if (safePaths.length === 0) {
    return ['- `(not specified)`'];
  }

  return safePaths.map(filePath => `- \`${filePath}\``);
}

function getExpiryIso(now = new Date(), maxAgeHours = DEFAULT_STALE_HOURS) {
  return new Date(now.getTime() + getSafeMaxAgeHours(maxAgeHours) * 60 * 60 * 1000).toISOString();
}

function formatEntry({ action, note, task, paths }, rootDir, now = new Date(), maxAgeHours = DEFAULT_STALE_HOURS) {
  const parts = [
    `- ${now.toISOString()} - ${action}`
  ];

  const safeNote = redactText(note || task).trim();
  if (safeNote) {
    parts.push(`- ${safeNote}`);
  }

  const safePaths = paths
    .map(filePath => normalizePathForWorklog(rootDir, filePath))
    .filter(Boolean);
  if (safePaths.length > 0) {
    parts.push(`- paths: ${safePaths.join(', ')}`);
  }
  parts.push(`- expires: ${getExpiryIso(now, maxAgeHours)}`);

  return parts.join(' ');
}

function buildInitialWorklog({ agentName, sessionId, task, paths, maxAgeHours }, rootDir, now = new Date()) {
  const safeTask = redactText(task || 'Task not specified').trim();
  const staleHours = getSafeMaxAgeHours(maxAgeHours);
  return [
    '# Local Agent Worklog',
    '',
    'This scratch file is local-only, ignored by Git and safe to delete. It is not a lock.',
    '',
    `- Session: \`${sanitizeSlug(sessionId, 'session')}\``,
    `- Agent: \`${redactText(agentName)}\``,
    `- Status: \`active\``,
    `- Started: \`${now.toISOString()}\``,
    `- Stale-after: \`${staleHours}h without update\``,
    `- Task: ${safeTask}`,
    '',
    '## Current Paths',
    '',
    ...formatPaths(rootDir, paths),
    '',
    '## Activity',
    ''
  ].join('\n');
}

function appendWorklogEntry(filePath, entry) {
  const separator = fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8').endsWith('\n') ? '' : '\n';
  fs.appendFileSync(filePath, `${separator}${entry}\n`, 'utf8');
}

function writeWorklog(options = {}) {
  const rootDir = path.resolve(options.rootDir || path.join(__dirname, '..'));
  const action = options.action || 'update';
  if (!VALID_ACTIONS.has(action)) {
    throw new Error(`AGENT_WORKLOG_INVALID_ACTION: Expected one of ${Array.from(VALID_ACTIONS).join(', ')}.`);
  }

  ensureWorklogDir(rootDir);
  const maxAgeHours = getSafeMaxAgeHours(options.maxAgeHours);
  const now = options.now || new Date();
  const removedStale = clearStaleWorklogs(rootDir, maxAgeHours, now);

  const agentName = options.agent || getDefaultAgentName(options.env);
  const paths = Array.isArray(options.paths) ? options.paths : [];

  if (action === 'list') {
    return {
      action,
      files: listWorklogFiles(rootDir),
      removedStale
    };
  }

  if (action === 'clear') {
    const files = listWorklogFiles(rootDir);
    for (const filePath of files) {
      fs.unlinkSync(filePath);
    }
    return {
      action,
      removed: files,
      removedStale
    };
  }

  const latestFile = findLatestSessionFile(rootDir, agentName);
  const sessionId = options.session || options.env?.AGENT_WORKLOG_SESSION || (action === 'start' || !latestFile
    ? createSessionId(agentName, options.now, options.pid)
    : path.basename(latestFile, '.md'));
  const filePath = getWorklogFile(rootDir, sessionId);

  if (action === 'done') {
    const targetFile = fs.existsSync(filePath) ? filePath : latestFile;
    if (targetFile && fs.existsSync(targetFile)) {
      fs.unlinkSync(targetFile);
      return {
        action,
        removed: [targetFile],
        removedStale,
        sessionId
      };
    }
    return {
      action,
      removed: [],
      removedStale,
      sessionId
    };
  }

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, `${buildInitialWorklog({
      agentName,
      sessionId,
      task: options.task,
      paths,
      maxAgeHours
    }, rootDir, now)}\n`, 'utf8');
  }

  appendWorklogEntry(filePath, formatEntry({
    action,
    note: options.note,
    task: options.task,
    paths
  }, rootDir, now, maxAgeHours));

  return {
    action,
    filePath,
    removedStale,
    sessionId
  };
}

function runCli(argv = process.argv.slice(2), io = console) {
  try {
    const options = parseArgs(argv);
    if (options.help) {
      io.log(printUsage());
      return 0;
    }

    const result = writeWorklog(options);
    if (result.action === 'list') {
      if (result.files.length === 0) {
        io.log('[agent-worklog] No active local worklogs.');
      } else {
        for (const filePath of result.files) {
          io.log(filePath);
        }
      }
      return 0;
    }

    if (result.action === 'clear' || result.action === 'done') {
      io.log(`[agent-worklog] Removed ${result.removed.length} local worklog file(s).`);
      return 0;
    }

    io.log(`[agent-worklog] ${result.action} ${result.filePath}`);
    io.log(`[agent-worklog] session ${result.sessionId}`);
    return 0;
  } catch (error) {
    io.error(`AGENT_WORKLOG_WRITE_FAILED: ${error.message}`);
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = runCli();
}

module.exports = {
  DEFAULT_STALE_HOURS,
  VALID_ACTIONS,
  WORKLOG_DIR_NAME,
  buildInitialWorklog,
  clearStaleWorklogs,
  createSessionId,
  formatEntry,
  getWorklogDir,
  getExpiryIso,
  getSafeMaxAgeHours,
  normalizePathForWorklog,
  parseArgs,
  redactText,
  runCli,
  sanitizeSlug,
  writeWorklog
};
