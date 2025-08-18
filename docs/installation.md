# Installation

This guide describes how to set up BlogposterCMS for local development. Production deployments should always review the [Security Notes](security.md) before going live.

1. **Clone the repository**
   ```bash
   git clone https://github.com/m41130/BlogposterCMS
   cd BlogposterCMS
   ```
2. **Install dependencies**
   ```bash
   npm install
   ```
3. **Bundle front-end assets**
   ```bash
   npm run build
   ```

4. **Create your environment file**
   Copy `env.sample` to `.env` and fill in the required values. Use strong, unique strings for all secrets.
   ```bash
   cp env.sample .env
   # edit .env
   ```
5. **Run the server**
   ```bash
   npm start
   ```
6. **Run the setup wizard**
   Open `http://localhost:3000/install` and complete the short wizard to create the first admin user and site profile.
7. **Open the CMS**
   Navigate to `http://localhost:3000/` in your browser. The admin area lives under `/admin`.

The project ships with several core modules enabled by default. Optional modules can be added under `modules/` and will be loaded by the Module Loader when present.
