# Analytics Manager

`analyticsManager` is the core owner of structured public page-delivery and
authenticated system-activity reporting. The existing admin facade exposes
`analytics.summary`, guarded by `analytics.read`; there is no public reporting API.

## Boundaries

The module uses DatabaseManager's fixed Analytics placeholders for bounded,
idempotent batches and retention. Its collector accepts only normalized metadata,
never request payloads, tokens, cookies or raw IP/user-agent values.

See [Analytics](../analytics.md) for the measurement definitions, privacy limits,
storage bounds, failure codes, workspace integration and regression coverage.
