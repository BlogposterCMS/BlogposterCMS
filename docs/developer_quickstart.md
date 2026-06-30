# Developer Quickstart

This page summarises the steps to spin up BlogposterCMS for local development and run the included tests. Make sure you have Node.js installed.
First follow the [Installation](installation.md) guide if you have not yet set up the project.

1. **Clone and install**
   ```bash
   git clone <repo-url>
   cd BlogposterCMS
   npm install
   ```

2. **Create `.env`**
   ```bash
   cp env.sample .env
   # edit .env and replace the placeholder secrets
   ```
  The sample defaults to the local SQLite engine (`CONTENT_DB_TYPE=sqlite`),
  which stores data in `./data/cms.sqlite` and does not require a local
  PostgreSQL or MongoDB service. Use strong random values for `JWT_SECRET`,
  `AUTH_MODULE_INTERNAL_SECRET` and the various `*_SALT` variables. The
  application no longer provides fallback secrets, so missing values will cause
  startup errors.

  The admin iframe origin guard also requires an RSA key pair. Generate one,
  escape PEM newlines as `\n`, then paste the values into
  `APP_FRAME_ORIGIN_TOKEN_PRIVATE_KEY` and
  `APP_FRAME_ORIGIN_TOKEN_PUBLIC_KEY`:

   ```bash
   openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out origin-token-private.pem
   openssl rsa -in origin-token-private.pem -pubout -out origin-token-public.pem
   ```

3. **Build assets and start the server**
   ```bash
   npm run build
   npm start
   ```
   The server listens on the port configured in `.env` (default `3000`). Visit
   `http://localhost:3000/` to access the CMS.
   During local non-production setup, `DEV_AUTOLOGIN=true` lets the first-run
   installer prefill the default `admin` / `123` development account and allows
   that weak password from loopback requests. Set `DEV_AUTOLOGIN=false` when you
   want to exercise the strict login and install forms locally.
   In development, console output is also mirrored into human-readable files
   under `logs/dev/`: `server.log` for all server messages, `errors.log` for
   warnings/errors, and `requests.log` for HTTP method, path, status and
   duration. Set `DEV_FILE_LOGS=false` in `.env` to disable this mirror.

4. **Run tests**
   ```bash
   npm test
   ```
   The test suite now uses **Jest**. All tests reside in the `tests/` directory.
   Ensure the server is **not** already running when you execute them.
   A dedicated command is provided to verify database placeholder parity across
   Postgres, MongoDB and SQLite:

   ```bash
   npm run placeholder-parity
   ```

5. **Coding conventions**
   - Keep modules self-contained and communicate only via meltdown events.
   - Check `npm audit` regularly to catch vulnerable dependencies.
   - We recommend using `eslint` (not included by default) to maintain
     consistent style.
