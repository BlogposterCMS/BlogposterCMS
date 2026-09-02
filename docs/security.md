# Security Notes

## Dependency security baseline

The supported CI/container runtime is Node.js 24. Keep the full-tree
`npm audit --audit-level=high` gate; development/build dependencies are not
excluded. The September 2026 remediation refreshes the lockfile and upgrades
ZIP/native installer dependencies without replacing Express 4 routes, SQLite
authority, or the existing bcryptjs login implementation. Scoped `qs` 6.16.0
overrides for Express/body-parser bridge their older minor-range constraints;
remove them only when the upstream ranges admit a fixed parser and tests pass.
Regression coverage includes forged ZIP size allocation, ordinary ZIP reads,
native hash interoperability, HTTP query/form parsing and SQLite content saves.

The upstream `sqlite3` repository is archived. Its patched 6.0.1 dependency is
a bounded remediation, not a long-term support guarantee. Track maintenance
separately; replacing the database adapter requires its own compatibility,
backup/restore and cutover decision. Container isolation and deployment gates
are documented in [Container deployment](container-deployment.md).

Agent access codes are one-time, short-lived and exchanged for least-privilege
`agent` tokens. The localhost dev-session helper is disabled in production and
can be disabled locally with `DEV_AGENT_LOGIN=false`.

BlogposterCMS was designed with multiple layers of security in mind. While no system is entirely foolproof, following these guidelines will help keep your installation safe.

- **Environment secrets** – Never commit real secret values to version control. Copy `env.sample` to `.env` and provide strong random strings for all salts and tokens.
 - **HTTPS** – When running in production, place the app behind HTTPS and set `APP_ENV=production` (or `NODE_ENV=production`) to enable secure cookies and redirects.
- **Rate limiting** – `config/security.js` sets limits for login attempts and meltdown API calls. Tune these using `LOGIN_LIMIT_MAX` and `API_RATE_LIMIT_MAX` if needed.
- **Weak credentials** – Logins and first-install passwords under 12 characters are only accepted from local non-production requests while `DEV_AUTOLOGIN` is enabled or `ALLOW_WEAK_CREDS=I_KNOW_THIS_IS_LOCAL` is set. Production startup aborts if a user named `admin` or a short password is detected.
- **CSRF protection** – Admin routes use CSRF tokens to prevent cross-site request forgery. Clients must include the token when authenticating or performing sensitive actions.
- **Module process isolation** - Optional community modules run in external runner processes instead of the CMS host process. They receive no raw Express app, no host objects and only whitelisted service environment variables. Module-owned data access goes through `moduleHost.storage`, which normalizes physical tables and rejects raw SQL markers instead of exposing a host `dbClient`. Module manifests may declare only their own permission namespace and must request core event access separately; the admin UI stores approved event grants in the registry. Protected user, role, permission, module, settings, auth and app-management events cannot become permanent grants and require a one-time approval by an admin who has both `modules.manageAccess` and the target permission. This is not a full OS sandbox; use container, microVM, filesystem and network policy before treating Marketplace code as fully untrusted production input.
- **JWT event bus** – All internal actions pass through the meltdown event bus. Each event carries a signed token and is validated before execution to prevent unauthorized operations.

- **HTTP security headers** – Configure a Content-Security-Policy and other headers (using middleware such as `helmet`) to protect against common attacks like XSS and clickjacking.
- **Session management** – Keep JWT secrets private and rotate them periodically. Tokens should expire after a reasonable time, especially for admin accounts.
- **Dependency audits** – Run `npm audit` regularly and update packages when security fixes are published. Review third‑party modules before enabling them.
- **Database privileges** – Create database users with only the permissions they need and restrict remote access where possible.
- **Monitoring and logs** – Record login attempts and important actions. Reviewing logs helps detect suspicious behavior early.

- **Content sanitization** – Design content is sanitised both when it is saved server-side and again when it is rendered in the browser. Public pages retain `<style>` tags while stripping scripts and unsafe CSS patterns (like `expression` or URLs using `javascript:` or `data:`) so designs render without enabling script injection.
- **Public media boundary** – `/media/...` serves only files already stored
  below Media Manager's `library/public` directory. Requests pass through a
  realpath containment guard and reject TypeScript sources, secret-shaped
  filenames and package manifests before static delivery.
- **Public nested-page boundary** – Catch-all public page routes retain all
  pathname segments only after the existing slug sanitizer has normalized and
  length-limited them. The server renders only a matching published page;
  unknown nested paths continue to the normal not-found handler.
- **Custom design scripts** – Runtime rendering only executes design-supplied JavaScript when the payload carries an explicit trust flag (such as `allowCustomJs`). Only literal boolean `true`, `1` or the string equivalents `'true'`, `'1'`, `'yes'`, `'y'` or `'on'` are treated as trusted so stringified falsy values remain blocked. Restrict that capability to trusted authors via permissions or workflow reviews and audit designs regularly.

Always review your access logs and keep dependencies up to date. Security patches will continue to harden the platform over time.

## Admin iframe origin whitelist

The admin dashboard loads apps such as the designer inside an `<iframe>` and exchanges data via `postMessage`. To stop hostile pages from injecting commands, define the set of trusted parent origins in `config/security.js` or via the `APP_FRAME_ALLOWED_ORIGINS` environment variable. Multiple origins can be supplied as a comma-separated list (for example `https://admin.example.com,https://staging-admin.example.com`).

At startup the CMS now requires an RSA key pair for iframe origin tokens. Provide the PEM-encoded values through the environment:

- `APP_FRAME_ORIGIN_TOKEN_PRIVATE_KEY` – PKCS#8 private key
- `APP_FRAME_ORIGIN_TOKEN_PUBLIC_KEY` – SPKI public key

Startup aborts if either value is missing so deployments cannot fall back to an insecure development key. A short-lived, signed token that encodes the allowed origins is delivered to the iframe via the query string, and the designer downloads the matching public key from `/apps/designer/origin-public-key.json` before verifying the signature with the WebCrypto API. Only when the signature, referrer origin, and `postMessage` source all match the configured whitelist will the iframe accept admin tokens.

Origins reported as `null` (from sandboxed or `about:blank` documents) or using non-HTTP(S) schemes remain blocked even if the origin token lists them.

Sandboxed apps that need small browser-local UI preferences use the existing
request/response AppBridge events `appPreference.get` and
`appPreference.set`. The dashboard validates the key, limits serialized values
to 4096 bytes and stores them below an app-specific namespace. The child never
receives raw `localStorage` access and cannot select another app's namespace.
These preferences are non-sensitive UI state only; tokens, permissions and
server-owned settings must not use this contract.

The same signed token authorizes the nested Design Studio Live Preview without
weakening the outer app-frame sandbox. Designer forwards `originToken` to the
normal public page route only with `designer-live-preview=1`. The server
verifies the RSA signature, issue/expiry timestamps and configured origin scope
before removing `X-Frame-Options: SAMEORIGIN` for that one response. Invalid or
expired requests fail closed with
`DESIGNER_LIVE_PREVIEW_ORIGIN_TOKEN_*`, keep the frame header and use
`Cache-Control: no-store`. Maintenance middleware lets these requests reach
the public-route verifier without redirecting or stripping the signed query;
ordinary public requests still follow the configured maintenance page. Never
add `allow-same-origin` to the admin app iframe as a Preview workaround.

For local development you can generate a key pair with:

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out origin-token-private.pem
openssl rsa -in origin-token-private.pem -pubout -out origin-token-public.pem
```

Paste the PEM strings (with newline escapes) into your `.env` file before starting the server.

## Troubleshooting Secure Login

When `APP_ENV=production` (or `NODE_ENV=production`) is set, the `admin_jwt` cookie is marked as `secure`.
Browsers will only store this cookie over HTTPS connections. If you access the
admin interface using plain HTTP, the login page may simply reload without an
error because the cookie is ignored. Either use HTTPS (for example via a local
reverse proxy) or unset `APP_ENV`/`NODE_ENV` while testing locally.

## Module Update Supply Chain

Community module updates are downloaded only from the configured
`trustedUpdateSource`, currently GitHub releases. Publish a ZIP plus SHA-256
sidecar for every release and configure a public signing key when possible.
The updater validates the package with the installer policy, blocks downgrades
and module-name mismatches, requires admin review for new core access, runs the
health check before swapping folders and keeps a backup for rollback.

## Developing Secure Modules

When writing your own modules keep these best practices in mind:

1. Validate and sanitize all user-supplied data before emitting events.
2. Never trust payloads from other modules unless they include a valid JWT and the expected permissions.
3. Avoid dynamic code execution (such as `eval`) and keep your dependency list small.
4. Document the permissions your module requires in `moduleInfo.json` so administrators understand the impact.

Following these rules helps protect the entire system as it grows.
