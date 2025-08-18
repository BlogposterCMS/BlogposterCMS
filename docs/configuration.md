# Configuration Overview

BlogposterCMS relies on environment variables for most of its settings. The
`env.sample` file in the project root documents every supported option. Copy it
to `.env` and adjust the values for your setup.

Key variables to review:

| Variable | Purpose |
|----------|---------|
| `PORT` | HTTP port used by the server. |
| `JWT_SECRET` | Base secret for token signing. **Change this** before going live. |
| `APP_BASE_URL` | Public URL used for share links and sitemaps. |
| `CONTENT_DB_TYPE` | Choose `postgres`, `mongodb` or `sqlite`. |
| `PG_*` / `MONGODB_URI` / `SQLITE_*` | Database connection settings. |
| `AUTH_MODULE_INTERNAL_SECRET` | Shared secret used by the auth module when issuing tokens. |
| `TOKEN_SALT_HIGH` etc. | Additional salts used to derive secrets per trust level. |
| `ENABLE_API` | Enables a lightweight REST API on `API_PORT` when set to `true`. |
| `ALLOW_REGISTRATION` | If `true`, users may self-register via the public event. |
| `DEV_AUTOLOGIN` | When `true`, localhost requests auto-login using `DEV_USER`. |
| `DEV_USER` | Username used for development auto-login. |
| `ALLOW_WEAK_CREDS` | Set to `I_KNOW_THIS_IS_LOCAL` to permit short passwords in dev. |

> **Note:** When `CONTENT_DB_TYPE` is `postgres` the database manager will
> create a `databasemanager` schema inside the main Postgres database. This step
> is skipped for MongoDB or SQLite installs.

For advanced deployments you can override defaults by creating
`config/runtime.local.js` or `config/security.local.js`. These files are
ignored by Git so your private values remain secret.
