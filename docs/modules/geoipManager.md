# GeoIP Manager

`geoipManager` is the reusable core GeoIP owner. Analytics does not own providers,
credentials, the MMDB reader or the outbound transport. The module is prepared
and **disabled by default**. No database, license, paid request or external
connection is provisioned automatically; real provider acceptance is untested.

## Configure one provider

Server deployment configuration, followed by a CMS restart:

| Provider | Configuration |
| --- | --- |
| Disabled | `GEOIP_PROVIDER=disabled` (default) |
| Local MaxMind/compatible MMDB | `GEOIP_PROVIDER=maxmind-db`, `GEOIP_DATABASE_PATH=/mounted/geoip/GeoLite2-City.mmdb` |
| Paid MaxMind City web service | `GEOIP_PROVIDER=maxmind-web`, `MAXMIND_ACCOUNT_ID`, `MAXMIND_LICENSE_KEY` |
| Self-hosted compatible service | `GEOIP_PROVIDER=self-hosted`, `GEOIP_SERVICE_URL=https://geo.example/lookup`, optional `GEOIP_SERVICE_TOKEN` |

Use an absolute readable path to your own licensed `.mmdb` file outside public
assets. Database updates and licensing remain operator responsibilities; restart
after replacing it. Country-only databases can omit city/region. No database or
credentials belong in Git or the public Settings response.

Web services reuse **RequestManager**. Add the exact hostname (for MaxMind,
`geoip.maxmind.com`) to the existing `REQUEST_MANAGER_ALLOWED_HOSTS`; retain any
already configured hosts. HTTPS, pinned public DNS addresses, no redirects,
bounded responses and existing timeouts remain enforced. A self-hosted service
must be reachable under this existing policy; private-network URLs/nonstandard
ports are not supported. Use a mounted MMDB for a fully local setup instead.

The self-hosted service receives `GET <base>/<URL-encoded-IP>` and optionally
`Authorization: Bearer …`. Return MaxMind-compatible JSON:

```json
{"country":{"iso_code":"CH"},"subdivisions":[{"names":{"en":"Basel"}}],"city":{"names":{"en":"Basel"}},"location":{"time_zone":"Europe/Zurich"}}
```

See the [MaxMind web-service contract](https://dev.maxmind.com/geoip/docs/web-services/requests/)
and [database documentation](https://dev.maxmind.com/geoip/docs/databases/).

## Shared contract and extension boundary

Other trusted core modules call `BACKEND_EVENTS.GEOIP_LOOKUP` (`geoipLookup`)
through `requestBackendEvent` and their existing core JWT with `ip` in the
payload. The module validates a verified registered core principal; users,
public clients and community modules cannot invoke it directly. There is no
public IP lookup API. The trusted host uses `service.lookup` as its stable
ingress, owned by the same active module lifecycle.

Results contain `status`, and on a hit bounded `country`, `region`, `city`,
`timezone` fields. They never contain the IP, provider response, coordinates,
license or filesystem path. Location is approximate and must not be used as
identity or authorization. Each caller owns its purpose/consent check; Analytics
requires explicit analytics consent before invoking GeoIP.

Providers live under `mother/modules/geoipManager/providers/`. Register a reviewed
adapter in `providers/index.js` implementing `create(config, request)` →
`{ lookup(ip) }`. It returns the documented data shape; the service minimizes it.
An arbitrary different database schema needs an adapter, not an Analytics change.

No IP cache is persisted. The service bounds concurrent work to eight lookups,
rejects common local/private addresses, and backs off for 30 seconds on provider
failures. Searchable results include `GEOIP_DISABLED`, `GEOIP_DATABASE_NOT_CONFIGURED`,
`GEOIP_DATABASE_UNAVAILABLE`, `GEOIP_CREDENTIALS_NOT_CONFIGURED`,
`GEOIP_ENDPOINT_INVALID`, `GEOIP_PRIVATE_ADDRESS`, `GEOIP_BUSY`, `GEOIP_NOT_FOUND`
and `GEOIP_PROVIDER_UNAVAILABLE`. Failure never breaks a delivered public page.

Local tests cover defaults, minimization, provider failures and mocked paid/self-hosted
requests. A real licensed MMDB, paid account and self-hosted deployment remain
unverified until configured. A separate visual GeoIP agent adapter is not needed
to call the existing authenticated module event; no parallel agent API exists.

## Boundaries

GeoIP is a trusted backend core module, not a widget or app. It provides only
approximate lookup results through the existing authenticated event contract.
Analytics owns consent and recording; RequestManager owns outbound policy.
Credentials stay server-side and no additional public lookup endpoint is added.

Independent updates replace authenticated GeoIP event handlers. Provider adapters,
connections and concurrency/backoff state remain host-owned; their source and
configuration changes require the host update path. Failed candidate readiness
keeps the existing service and event handler active.
