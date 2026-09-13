# Internal credential lifetime and public readiness

## Incident and bounded architecture review

Public requests and scheduled publishing failed with `AUTH_TOKEN_EXPIRED` while
the process remained alive. Core initialization cached module JWTs indefinitely,
although high-trust credentials default to a 24-hour lifetime. Runtime handlers
and background jobs captured the original string, so refreshing only the cache
would not repair those consumers. The public facade first validates the visitor's
public credential, then uses its internal module credential to read page storage;
the latter was the failing credential.

The previous readiness route had an unconditional successful default, and the
host did not provide a dependency check. Container health therefore missed this
outage. Readiness now exercises public credential acquisition and the canonical
public start-page lookup. Liveness remains independent. No watchdog restart is a
substitute for credential renewal.

## Boundaries retained

The host owns an expiry-aware credential provider per core module. Renewal uses
the existing Auth issuance event, is shared by concurrent callers and starts
before expiry. The lifecycle emitter recognizes only the exact credentials
supplied by the host at initialization; it substitutes their current credential
before ordinary authenticated dispatch. This also supports existing handlers
that captured the initialization string. Arbitrary payload credentials are not
substituted. Failed issuance prevents dispatch; it does not replay an operation.
The host cache and optional module-loader emitter use the same mechanism.
Core modules must use the injected emitter for module-credential requests;
independently retaining the raw global emitter does not participate in renewal.
Stable host service emitters follow the active lifecycle generation. Disposal
cancels an undispatched renewal and refuses to retire already-dispatched work
until its callback completes.

- Module issuance stays with Auth and its existing internal host authorization.
- Visitor, administrator and agent sessions retain their own expiry rules; their
  credentials must never be promoted or refreshed as a core module credential.
- MotherEmitter still checks signatures, expiry and subject restrictions before
  dispatch. A failed operation is not replayed to hide an authorization error.
- Public page publication and lane filtering remain in Runtime Manager.

## Remaining architectural limits

This is a review of the incident's authorization, lifecycle and readiness paths,
not a complete security audit. High-trust modules already receive wildcard
permissions and run in one process; event contracts are not process isolation.
Changing that trust model requires a separately scoped compatibility review.
Readiness covers the shared read path, not complete HTML rendering, every module,
provider availability or browser hydration. Keep HTTPS page, login, content
save/reload and media smoke checks in release acceptance.

## Regression evidence

Credential, lifecycle, bootstrap, session-continuity and HTTP health tests cover
expiry, concurrent renewal, issuance failure, foreign-session preservation,
drain/disposal and bounded readiness failure. The local CMS was also exercised
with `JWT_EXPIRY_HIGH=10s`: Docs, Help and readiness continued responding after
multiple lifetimes, including opening and reloading a Docs article in the browser.
This local test is not evidence that a production image has been updated.
