# Agent Access Module

`agentAccess` is the local/admin login bridge for automation clients that need
to call the existing AgentManager HTTP facade. It does not replace Auth and it
does not control surfaces itself. Auth still issues JWTs, and AgentManager
still owns `/admin/api/agent`.

## Purpose

- Create one-time agent access codes from the existing Access Control settings.
- Exchange a code for a short-lived `Authorization: Bearer` token.
- Provide a localhost-only development shortcut for Codex or similar agents.
- Keep generated tokens scoped to `agent.view` or `agent.control`.

## HTTP Routes

Admin routes require an authenticated admin cookie or bearer token and CSRF:

- `GET /admin/api/agent-access/codes`
- `POST /admin/api/agent-access/codes`
- `DELETE /admin/api/agent-access/codes/:codeId`

Agent/client routes do not require an admin session:

- `POST /admin/api/agent-access/exchange`
- `POST /admin/api/agent-access/dev-session`

`exchange` accepts `{ "code": "bp_agent_..." }` and returns:

```json
{
  "data": {
    "token": "...",
    "tokenType": "Bearer",
    "scope": "control",
    "expiresInSeconds": 900
  }
}
```

Use the returned token on the existing AgentManager API:

```txt
Authorization: Bearer <token>
GET /admin/api/agent/definition
```

## Local Development

Outside production, `POST /admin/api/agent-access/dev-session` is enabled for
localhost by default and uses `DEV_USER` or `admin`. If that user does not
exist in a local database, it falls back to an existing admin/user so Codex can
still attach to a development checkout. Set `DEV_AGENT_LOGIN=false` to disable
it.

Local development auto-login also defaults on when the dev user exists. Set
`DEV_AUTOLOGIN=false` to force the login form.

## Boundaries

- Agent Access is a core module and exposes only its dedicated HTTP routes;
  widgets, apps and community modules must not call its MotherEmitter events
  directly.
- One-time codes are stored in memory, hashed, and shown only when created.
- Codes expire automatically and are invalid after first exchange.
- Server restart clears open codes.
- Token exchange issues a user-backed JWT with role `agent`, not an admin role.
- `view` scope grants `agent.view`; `control` grants `agent.view` and
  `agent.control`.
- Production never allows the localhost dev-session shortcut.
