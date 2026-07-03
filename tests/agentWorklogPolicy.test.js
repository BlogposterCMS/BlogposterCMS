const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  redactText,
  writeWorklog
} = require('../tools/agent-worklog');

const rootDir = path.join(__dirname, '..');

function readRepoFile(filePath) {
  return fs.readFileSync(path.join(rootDir, filePath), 'utf8');
}

describe('agent worklog policy', () => {
  it('keeps local coordination files out of Git and documents the lifecycle', () => {
    expect(readRepoFile('.gitignore')).toContain('/.agent-worklog/');
    expect(readRepoFile('AGENTS.md')).toContain('npm run agent:worklog -- start');
    expect(readRepoFile('AGENTS.md')).toContain('npm run agent:worklog -- done');
    expect(readRepoFile('docs/index.md')).toContain('[Agent Worklog](agent-worklog.md)');
  });

  it('redacts common secret shapes before writing coordination notes', () => {
    const redacted = redactText('token=abc123456789 secret: hunter2 sk-test123456789012');

    expect(redacted).not.toContain('abc123456789');
    expect(redacted).not.toContain('hunter2');
    expect(redacted).not.toContain('sk-test123456789012');
    expect(redacted).toContain('[REDACTED]');
  });

  it('writes and clears a local per-agent worklog file', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'blogposter-agent-worklog-'));

    const started = writeWorklog({
      action: 'start',
      agent: 'jest-agent',
      task: 'token=abc123456789 update coordination docs',
      paths: ['AGENTS.md', path.join(os.tmpdir(), 'outside-secret.txt')],
      rootDir: tempRoot,
      pid: 1234,
      now: new Date('2026-07-03T10:00:00.000Z')
    });

    expect(fs.existsSync(started.filePath)).toBe(true);
    const content = fs.readFileSync(started.filePath, 'utf8');
    expect(content).toContain('AGENTS.md');
    expect(content).toContain('[outside-workspace]/outside-secret.txt');
    expect(content).toContain('Stale-after: `6h without update`');
    expect(content).toContain('expires: 2026-07-03T16:00:00.000Z');
    expect(content).not.toContain('abc123456789');

    const removed = writeWorklog({
      action: 'done',
      agent: 'jest-agent',
      session: started.sessionId,
      rootDir: tempRoot
    });

    expect(removed.removed).toHaveLength(1);
    expect(fs.existsSync(started.filePath)).toBe(false);
  });

  it('clears stale worklogs on the next list or update when an agent was stopped', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'blogposter-agent-worklog-'));
    const started = writeWorklog({
      action: 'start',
      agent: 'stopped-agent',
      task: 'interrupted coordination entry',
      rootDir: tempRoot,
      pid: 4321,
      maxAgeHours: 1,
      now: new Date('2026-07-03T10:00:00.000Z')
    });

    fs.utimesSync(
      started.filePath,
      new Date('2026-07-03T10:00:00.000Z'),
      new Date('2026-07-03T10:00:00.000Z')
    );

    const listed = writeWorklog({
      action: 'list',
      rootDir: tempRoot,
      maxAgeHours: 1,
      now: new Date('2026-07-03T11:30:00.000Z')
    });

    expect(listed.files).toHaveLength(0);
    expect(listed.removedStale).toEqual([started.filePath]);
    expect(fs.existsSync(started.filePath)).toBe(false);
  });
});
