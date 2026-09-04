# Backend Event Contracts

Backend communication continues to use the existing `motherEmitter`. The
contract layer in `mother/contracts/` is the single request boundary; it does
not introduce a second bus or change module ownership.

The generated files in `mother/contracts/` form one updateable contract set:

- `generatedBackendEventCatalog.js` owns the stable `BACKEND_EVENTS` constants.
- `generatedBackendEventCatalog.d.ts` gives those constants literal TypeScript
  types for browser and module callers.
- `generatedBackendEventContractSpecs.js` contains an event-specific payload
  schema and result name for every discovered backend event.
- `generatedBackendEventContracts.d.ts` documents the matching payload and
  result types for JavaScript and TypeScript consumers.

They are derived from module listeners, request calls and Runtime Manager
facade definitions, checked for drift and never edited by hand. Backend code
must not add raw event-name literals, private callback-to-Promise adapters or
temporary callback-forwarding wrappers.

## Enforced contracts

The HTTP adapter exposes five strict executable contracts:

| Contract | Payload | Result |
| --- | --- | --- |
| `issuePublicToken` | Auth module identity and optional purpose | Non-empty JWT string |
| `ensurePublicToken` | Auth module identity and optional current token | Non-empty JWT string |
| `cmsAdminApiRequest` | Runtime Manager identity, JWT, resource, action and optional params | `CmsAdminApiRequestResult` |
| `cmsPublicRuntimeRequest` | Runtime Manager identity, JWT, resource, action and optional params | `CmsPublicRuntimeRequestResult` |
| `dispatchAppEvent` | AppLoader identity, JWT, app name, event/type and optional data | `DispatchAppEventResult` |

`meltdownHttpPolicy` derives its direct-event allowlist from this registry. An
event cannot be exposed through `/api/meltdown` merely by adding another string
to the transport policy.

## Result types

```ts
type IssuePublicTokenResult = string;
type EnsurePublicTokenResult = string;

interface CmsAdminApiRequestResult {
  resource: string;
  action: string;
  eventName: string;
  data: JsonValue;
}

type CmsPublicRuntimeRequestResult = CmsAdminApiRequestResult;

interface DispatchAppEventResult {
  ok: boolean;
  handled: boolean;
  appName: string;
  event: string;
  data: JsonValue;
}
```

The Runtime Manager and AppLoader handler registrations validate these result
shapes before invoking existing callbacks. Invalid handler output therefore
fails at the owning boundary instead of becoming an ambiguous browser error.

Every internal catalog entry has its own generated result alias, for example
`DbSelectResult` or `DesignerSaveDesignResult`, instead of a shared unbounded
result marker. Internal results are bounded to `JsonValue | undefined` until an
explicit domain contract narrows them. Payload schemas contain the discovered
event-specific keys, strict module/auth metadata, and reject unknown keys when
all callers are statically closed. Dynamic facade payloads allow only JSON-safe
values or explicitly discovered callable fields.

Callable payload fields are inferred from direct function literals, direct
calls, and listener-side destructuring followed by a `typeof ... ===
'function'` guard. This keeps callback-bearing provider registrations, such as
`registerFontProvider.initFunction`, executable without weakening unrelated
payload fields to an unbounded schema.

## Errors and timeouts

Contract errors are normal `Error` instances with these stable fields:

```ts
interface EventContractFailure extends Error {
  code: string;
  status: number;
  eventName: string | null;
  details: Record<string, unknown> | null;
}
```

Framework codes are:

- `EVENT_CONTRACT_INVALID_PAYLOAD` (`400`)
- `EVENT_CONTRACT_NOT_REGISTERED` (`404`)
- `EVENT_CONTRACT_HANDLER_FAILED` (`500`)
- `EVENT_CONTRACT_INVALID_RESULT` (`500`)
- `EVENT_CONTRACT_DISPATCH_REJECTED` (`503`)
- `EVENT_CONTRACT_TIMEOUT` (`504`)
- `EVENT_CONTRACT_HTTP_EVENT_NAME_REQUIRED` (`400`)
- `EVENT_CONTRACT_HTTP_BATCH_INVALID` (`400`)
- `EVENT_CONTRACT_HTTP_AUTH_REQUIRED` (`401`)
- `EVENT_CONTRACT_HTTP_TOKEN_INVALID` (`401`)
- `EVENT_CONTRACT_HTTP_ADMIN_REQUIRED` (`403`)
- `EVENT_CONTRACT_HTTP_EVENT_REJECTED` (`403`)

An existing handler `error.code` and `error.status` are preserved. Errors
without a code receive `EVENT_CONTRACT_HANDLER_FAILED`. The HTTP adapter keeps
the backwards-compatible string `error` and adds `code`. `details` is exposed
only for the allowlisted keys `path`, `expected`, `actual`, `field`, `fields`,
`issues`, `reason`, `timeoutMs`, `requestId`, `operationId` and `code`;
credential-like nested keys are removed recursively.

The default backend deadline is 9 seconds. Long-running import, export and
module/app install operations declare a 300-second inner deadline. The admin
facade uses 305 seconds so its outer request cannot report a timeout while a
declared inner operation is still within its deadline. Module update clients
use matching browser deadlines. Timeouts do not cancel arbitrary third-party
side effects; handlers that cannot finish within the declared ceiling must be
designed as idempotent jobs before they are exposed through the facade.

## Schema format

Schemas are small declarative JavaScript objects. The validator supports the
types `json`, `undefined`, `function`, `object`, `array`, `string`, `number`,
`integer`, `boolean` and `null`, plus `required`, `properties`, typed or false
`additionalProperties`, `items`, `minLength`, `enum` and `anyOf`. The unbounded
`any` schema is rejected when a contract is defined. This is an internal schema
format, not a claim of full JSON Schema compatibility.

Authentication fields injected by the server may be declared in a schema, but
schema validation never replaces JWT, permission, app-manifest or module-host
checks.

## Upgrade and verification

After updating a checkout that contains older private `emitAsync` helpers or
inline `new Promise(... emitter.emit(...))` adapters, run:

```sh
npm run migrate:backend-events
npm run check:backend-events
```

The migration is idempotent. It removes private helper declarations/exports,
rewrites raw backend names to `BACKEND_EVENTS`, converts request callers to
`requestBackendEvent`, removes obsolete callback-forwarding wrappers, and
regenerates the catalog, schemas and type declarations. Complex nested chains
are rejected instead of being rewritten speculatively; convert those explicitly
into sequential `await requestBackendEvent(...)` calls and rerun the check. The
current tree has no remaining backend callback-to-Promise adapter outside the
canonical contract implementation. The check fails with
`BACKEND_EVENT_CONTRACT_LEGACY_ADAPTER`,
`BACKEND_EVENT_CONTRACT_LEGACY_CALLBACK_CALL`,
`BACKEND_EVENT_CONTRACT_LEGACY_CALL`,
`BACKEND_EVENT_CONTRACT_LEGACY_NAME`,
`BACKEND_EVENT_CONTRACT_UNBOUNDED_SCHEMA`,
`BACKEND_EVENT_CONTRACT_CATALOG_OUTDATED` or
`BACKEND_EVENT_CONTRACT_SCHEMAS_OUTDATED`,
`BACKEND_EVENT_CONTRACT_TYPES_OUTDATED`,
`BACKEND_EVENT_CONTRACT_PARSE_FAILED`. No database, volume or operating-system
migration is required because event contracts do not alter persisted data.

## Adding or refining an event

1. Reuse an existing contract when it already owns the operation.
2. Use `BACKEND_EVENTS` at callers, listeners and policy maps.
3. Run `npm run migrate:backend-events` to refresh the generated schema and
   declarations; narrow an HTTP/public contract explicitly when required.
4. Call it with `requestBackendEvent` instead of a local callback-to-Promise
   wrapper or direct callback emit.
5. Add payload, result, timeout, error-code and affected boundary tests.
6. Add it to the HTTP contract group only when the event is intentionally part
   of that transport surface.

The callback signature is confined to the canonical EventEmitter wire protocol
and owning listeners. Promise callers use the contract helper; the only dynamic
callback dispatch outside it is the documented community-module process bridge
in `moduleHost.js`. Lifecycle notifications may continue to use fire-and-forget
`emit` with `BACKEND_EVENTS`.
