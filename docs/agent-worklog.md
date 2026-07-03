# Agent Worklog

Parallel code work uses a local scratch directory at `.agent-worklog/`. Each
active agent writes one small Markdown file there with a task summary, touched
repo paths and timestamped progress notes. The directory is ignored by Git and
is only for same-machine coordination.

## Lifecycle

Start a local entry before editing files:

```bash
npm run agent:worklog -- start --task "short summary" --paths "AGENTS.md,tools/agent-worklog.js"
```

Refresh it when the scope changes:

```bash
npm run agent:worklog -- update --note "adjusting docs and tests" --paths "docs/agent-worklog.md,tests/agentWorklogPolicy.test.js"
```

List active entries before taking over nearby work:

```bash
npm run agent:worklog -- list
```

Clear your entry before the final response, handoff or commit:

```bash
npm run agent:worklog -- done
```

If Codex or another agent is stopped in the middle of work, it cannot run
`done`. That stale file is cleaned up automatically on the next `start`,
`update` or `list` once it has gone 6 hours without an update. Each activity
line also includes an `expires` timestamp so another agent can tell whether a
note is fresh.

`npm run agent:worklog -- clear` removes all local entries and should only be
used when no other active agent is working.

## Safety Rules

- Keep notes brief: task, touched paths, blocker and current status are enough.
- Do not write credentials, API keys, cookies, tokens, private user data, raw
  customer content or environment dumps.
- Prefer repository-relative paths. Outside-workspace paths are reduced to a
  basename by the helper.
- Treat the worklog as coordination scratch, not durable documentation.
