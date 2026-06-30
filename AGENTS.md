# Agent Working Guidelines

These rules apply to all automated agents and contributors working in this
repository. Treat them as project-level defaults unless a more specific
instruction in a subdirectory says otherwise.

## Working Style

- Understand the existing structure before changing code.
- Search for similar code, helpers, tests, and documentation before adding new
  patterns.
- Prefer reusing existing modules, contracts, components, and design language.
- Do not introduce new features, new product behavior, or new visual designs
  unless the task explicitly asks for them.
- Keep changes focused on the requested problem. Avoid unrelated refactors,
  formatting churn, or metadata changes.
- Preserve user or collaborator changes already present in the worktree.

## Code Quality

- Keep code modular, maintainable, and easy for humans to read.
- Use clear names and small helpers when they reduce real complexity.
- Add comments where they explain non-obvious decisions, invariants, security
  boundaries, or tricky flows. Avoid comments that merely restate the code.
- Prefer typed/structured APIs and parsers over ad-hoc string manipulation when
  the project already has suitable tools.
- Use explicit error messages or searchable error codes where they help
  debugging, especially at boundaries, validation points, transport layers, and
  user-facing operations.
- Keep UI logic, data access, transport payloads, and domain logic separated
  where the existing architecture supports that separation.

## Agent-Ready Architecture

- Shape meaningful user-facing and admin workflows so they can be controlled by
  an agent later without making DOM scraping the only path.
- Prefer existing AgentManager, AppLoader, module event and shared-client
  contracts when exposing agent-readable snapshots, stable actions or command
  handlers.
- Do not expose every internal function as an agent action. Keep domain logic
  behind the existing module, service, permission, validation and transport
  boundaries.
- When an area's agent architecture is not clear yet, preserve separation,
  stable identifiers, typed payloads and searchable error codes, then document
  the missing adapter instead of creating a parallel agent-only API.

## Design Studio Agent Feedback

- Design Studio work must keep `ui/designer/app/agentSurface.ts` as the direct
  agent feedback channel. Any change to canvas rendering, layout containers,
  widget placement, Style Source behavior, selection, save/publish state or
  visual preview behavior must update the feedback snapshot, actions, warnings
  or docs before the feature is considered complete.
- The feedback channel must stay on the existing AgentManager/AppLoader
  `agentSurface` contract and expose stable ids, structured layout tree data,
  widget placements, Style Source relationships, selected object state,
  viewport/visual-preview metadata, stable bounds and searchable
  `DESIGNER_AGENT_FEEDBACK_*` warnings. Do not add a parallel Designer-only
  agent API or make DOM scraping the only way to understand the Studio state.
- When a Design Studio command family is missing, document the missing adapter
  in `docs/design-studio-agent-feedback.md` and keep domain logic behind the
  existing service, permission, validation and transport boundaries.

## Tests

- Add or update tests for every meaningful behavior change.
- Prefer focused regression tests near the changed behavior.
- Add boundary tests when a change protects architecture, module ownership, or
  public contracts.
- If tests cannot be run, explain why and name the residual risk.

## Documentation And Changelog

- Update `CHANGELOG.md` for meaningful user-visible, architectural, or
  operational changes.
- Update docs when changing public contracts, architecture, setup steps,
  workflows, module boundaries, or behavior that future contributors need to
  understand.
- Keep documentation concise and practical.

## UI And Design

- Preserve the existing UI language unless the task explicitly asks for a
  redesign.
- Reuse existing components, controls, tokens, and layout patterns.
- Do not add decorative UI, marketing-style surfaces, or new interaction models
  when a smaller refinement fits the request.
- Verify that changed UI remains usable across expected viewport sizes when
  practical.

## Safety

- Do not remove or rewrite unrelated files.
- Do not bypass security, permission, token, or sandbox boundaries.
- Prefer failing closed for auth, transport, sanitization, and permission
  checks.
- Keep generated or build artifacts consistent with the repository's existing
  workflow.
