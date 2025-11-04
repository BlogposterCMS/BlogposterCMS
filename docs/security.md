# Security Notes

BlogposterCMS was designed with multiple layers of security in mind. While no system is entirely foolproof, following these guidelines will help keep your installation safe.

- **Environment secrets** – Never commit real secret values to version control. Copy `env.sample` to `.env` and provide strong random strings for all salts and tokens.
 - **HTTPS** – When running in production, place the app behind HTTPS and set `APP_ENV=production` (or `NODE_ENV=production`) to enable secure cookies and redirects.
- **Rate limiting** – `config/security.js` sets limits for login attempts and meltdown API calls. Tune these using `LOGIN_LIMIT_MAX` and `API_RATE_LIMIT_MAX` if needed.
- **Weak credentials** – Logins with passwords under 12 characters are only accepted from `localhost` when `ALLOW_WEAK_CREDS=I_KNOW_THIS_IS_LOCAL`. Production startup aborts if a user named `admin` or a short password is detected.
- **CSRF protection** – Admin routes use CSRF tokens to prevent cross-site request forgery. Clients must include the token when authenticating or performing sensitive actions.
- **Module sandboxing** – Optional modules run inside a minimal sandbox built with Node's `vm` module. Only `path` and `fs` can be required and network access is blocked. Faulty or malicious modules are deactivated automatically when health checks fail.
- **JWT event bus** – All internal actions pass through the meltdown event bus. Each event carries a signed token and is validated before execution to prevent unauthorized operations.

- **HTTP security headers** – Configure a Content-Security-Policy and other headers (using middleware such as `helmet`) to protect against common attacks like XSS and clickjacking.
- **Session management** – Keep JWT secrets private and rotate them periodically. Tokens should expire after a reasonable time, especially for admin accounts.
- **Dependency audits** – Run `npm audit` regularly and update packages when security fixes are published. Review third‑party modules before enabling them.
- **Database privileges** – Create database users with only the permissions they need and restrict remote access where possible.
- **Monitoring and logs** – Record login attempts and important actions. Reviewing logs helps detect suspicious behavior early.

- **Content sanitization** – Public pages retain `<style>` tags while stripping scripts and unsafe CSS patterns (like `expression` or URLs using `javascript:` or `data:`) so designs render without enabling script injection.

Always review your access logs and keep dependencies up to date. Security patches will continue to harden the platform over time.

## Admin iframe origin whitelist

The admin dashboard loads apps such as the designer inside an `<iframe>` and exchanges data via `postMessage`. To stop hostile pages from injecting commands, define the set of trusted parent origins in `config/security.js` or via the `APP_FRAME_ALLOWED_ORIGINS` environment variable. Multiple origins can be supplied as a comma-separated list (for example `https://admin.example.com,https://staging-admin.example.com`). The server forwards the whitelist to the iframe, and any message originating from a different origin is ignored.

Origins reported as `null` (from sandboxed or `about:blank` documents) or using non-HTTP(S) schemes are always rejected, even if the local admin origin is part of the whitelist.

## Troubleshooting Secure Login

When `APP_ENV=production` (or `NODE_ENV=production`) is set, the `admin_jwt` cookie is marked as `secure`.
Browsers will only store this cookie over HTTPS connections. If you access the
admin interface using plain HTTP, the login page may simply reload without an
error because the cookie is ignored. Either use HTTPS (for example via a local
reverse proxy) or unset `APP_ENV`/`NODE_ENV` while testing locally.

## Developing Secure Modules

When writing your own modules keep these best practices in mind:

1. Validate and sanitize all user-supplied data before emitting events.
2. Never trust payloads from other modules unless they include a valid JWT and the expected permissions.
3. Avoid dynamic code execution (such as `eval`) and keep your dependency list small.
4. Document the permissions your module requires in `moduleInfo.json` so administrators understand the impact.

Following these rules helps protect the entire system as it grows.
