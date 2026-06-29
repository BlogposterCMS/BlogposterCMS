[![Tests](https://github.com/BlogposterCMS/BlogposterCMS/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/BlogposterCMS/BlogposterCMS/actions/workflows/ci.yml)
![Alpha status](https://img.shields.io/badge/status-alpha-red)

# BlogposterCMS

BlogposterCMS is an open-source CMS and website runtime for people who want
WordPress-like ownership of content without inheriting a monolithic add-on
stack. It combines a modular backend, a visual Design Studio, structured page
data, widgets, apps and import tooling into one self-hostable Node.js project.

The goal is simple: editors should be able to build pages visually, while
developers still get clear contracts, readable code and strict extension
boundaries.

## Current Status

BlogposterCMS is currently `v0.7` alpha software. It is usable for development,
experimentation and architecture work, but the data model, builder behavior and
extension contracts can still change between releases.

Existing setups may break during alpha updates. Do not treat this as a stable
drop-in production CMS yet.

## What Makes It Different

BlogposterCMS is not built around one giant "do everything" extension type.
It separates responsibilities:

- **Modules** own backend capability and run through a permission-checked event
  system.
- **Widgets** render public or admin UI blocks.
- **Apps** provide larger admin/tool surfaces in isolated frames.
- **Themes** control presentation and must not become executable backend code.

That separation matters because it keeps authority visible. A widget cannot
quietly become a backend module, a theme cannot mutate users, and a community
module does not receive the raw Express app.

The core communicates through `motherEmitter`, a JWT-secured event bus.
Community modules use a scoped `moduleHost` facade and run outside the CMS host
process. They can request access to core events, but those requests are
declared in `moduleInfo.json`, reviewed by the admin, and stored as explicit
grants.

## Why Public Pages Feel Fast

BlogposterCMS is designed so public page delivery stays thin.

The public route serves a small HTML shell and injects only the runtime facts a
page needs: page id, slug, lane, public token, active theme and nonce. Static
assets are served directly from guarded `/assets`, `/build`, `/themes`,
`/widgets` and `/apps` routes. The browser runtime then composes the page from
structured page, layout and widget data.

This avoids running the full admin/editor environment for every public page
request. The heavy surfaces, such as Design Studio and admin widgets, stay on
the admin side. Public rendering uses the smaller page renderer bundle and
loads only the widget/runtime contracts it needs.

Several smaller decisions add up:

- Static files are served directly instead of being rebuilt per request.
- Runtime browser modules are compiled with an mtime-based cache during
  development.
- Meltdown supports `/api/meltdown/batch`, so browser code can group event
  calls instead of creating avoidable round trips.
- Page, layout and widget transport payloads are normalized in focused runtime
  helpers instead of being rebuilt ad hoc in each UI surface.
- Import and builder data are stored as structured content, layout and widget
  metadata, so the renderer can work from known contracts instead of scraping a
  whole CMS page builder on every request.

There is no public benchmark claim here yet. The point is architectural:
BlogposterCMS keeps the public hot path small, static-friendly and separate
from the admin builder.

## Main Capabilities

- Visual page building through Design Studio and the shared runtime layout
  system.
- Nested pages, content entries, media, comments, navigation, SEO, workflow,
  revisions, previews, themes and translations.
- First-party public widgets such as text, media, buttons, navigation menus,
  breadcrumbs and galleries.
- WordPress WXR import plus a visual site-package importer/exporter path for
  rendered pages, normalized HTML, local assets, menus, redirects, SEO metadata
  and Design Studio mapping hints.
- SQLite, PostgreSQL and MongoDB support through the database manager layer.
- Admin/runtime transport through explicit module events instead of direct
  cross-module calls.
- Process-isolated community module loading with declared permissions,
  requested access and module-owned storage.

## Architecture At A Glance

`app.js` is intentionally small. It loads configuration, attaches process
handlers and delegates server setup to `mother/server/createBlogposterApp.js`.

The server composition layer mounts static assets, security middleware, core
module bootstrap, Meltdown HTTP transport, auth, app management, agent APIs,
the admin shell, installation routes, maintenance checks and public page
rendering in a fixed order.

Core product behavior remains in `mother/modules/*`. Server files are
transport and composition code, not a second business-logic layer.

Useful docs:

- [Architecture overview](docs/architecture.md)
- [Server composition](docs/server_composition.md)
- [Module architecture](docs/modules.md)
- [Permission system](docs/permission_system.md)
- [Community module guide](docs/community_module_guide.md)
- [UI architecture](docs/ui_architecture.md)

## Quickstart

```bash
git clone https://github.com/BlogposterCMS/BlogposterCMS
cd BlogposterCMS
npm install
npm run build
cp env.sample .env
npm start
```

On Windows PowerShell, use:

```powershell
Copy-Item env.sample .env
```

Before starting a real environment, replace every placeholder in `.env` with a
strong unique secret. Do not deploy with sample secrets.

After the server boots:

1. Open `http://localhost:3000/install`.
2. Complete the setup wizard and create the first admin user.
3. Open `http://localhost:3000/admin`.

More detail is available in the [developer quickstart](docs/developer_quickstart.md)
and the [installation guide](docs/installation.md).

## Development

Common commands:

```bash
npm test
npm run build
npm run dev
```

The default runtime entrypoint is `node app.js`. The development command uses
`nodemon app.js`.

## Documentation

Start with [docs/index.md](docs/index.md). The docs cover installation,
configuration, modules, widgets, permissions, UI architecture, security and the
current workboard.

## Contributing

Contributions are welcome while the project is in alpha, especially focused
fixes, tests, docs and module/widget work that follows the existing boundaries.
Please keep new behavior explicit and update the relevant tests and docs with
meaningful changes.

## Support

If you like the direction and want to support the project:

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-%23FF813F.svg?style=flat&logo=buy-me-a-coffee&logoColor=white)](https://coff.ee/BlogposterCMS)

## License

MIT. See [LICENSE](LICENSE).
