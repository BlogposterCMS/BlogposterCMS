# Installation

This guide describes how to set up BlogposterCMS for local development. Production deployments should always review the [Security Notes](security.md) before going live.

1. **Clone the repository**
   ```bash
   git clone https://github.com/BlogposterCMS/BlogposterCMS
   cd BlogposterCMS
   ```
2. **Install dependencies**
   Use Node.js 24 LTS (the same major used by CI and the container) and install
   the reviewed lockfile. Native SQLite and bcrypt must load successfully on
   the target architecture; do not bypass failed install scripts.
   ```bash
   npm ci
   ```
3. **Bundle front-end assets**
   ```bash
   npm run build
   ```

4. **Create your environment file**
   Copy `env.sample` to `.env` and fill in the required values. The sample uses SQLite by default (`CONTENT_DB_TYPE=sqlite`) so local setup can run without PostgreSQL or MongoDB. Use strong, unique strings for all secrets and add the required admin iframe RSA key pair described in [Security Notes](security.md#admin-iframe-origin-whitelist).
   ```bash
   cp env.sample .env
   # edit .env
   ```
5. **Run the server**
   ```bash
   npm start
   ```
6. **Run the setup wizard**
   Open `http://localhost:3000/install` and complete the short wizard to create the first admin user and site profile. The final step shows an inline accent colour picker beneath the project name so you can preview your choice live while selecting from the preset palette. If a stale wizard submits after another session has already completed setup, BlogposterCMS shows an already-installed modal with a dashboard-entry action instead of the raw `SHELL_INSTALL_SUBMIT_FAILED: Already installed` message.
7. **Open the CMS**
   Navigate to `http://localhost:3000/` in your browser. The admin area lives under `/admin`.

The project ships with several core modules enabled by default. Optional modules can be added under `modules/` and will be loaded by the Module Loader when present.

For the independent server image and its persistence/reverse-proxy requirements,
see [Container deployment](container-deployment.md).
