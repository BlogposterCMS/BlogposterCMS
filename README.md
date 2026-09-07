[![Tests](https://github.com/BlogposterCMS/BlogposterCMS/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/BlogposterCMS/BlogposterCMS/actions/workflows/ci.yml)
![Alpha status](https://img.shields.io/badge/status-alpha-red)

# BlogposterCMS

**An open-source, modular CMS with visual website building and shared workflows
for people and AI agents. Self-host your content, compose your design, extend
your site.**

Blogposter combines a visual Design Studio, content management and structured
agent access in one self-hostable project. You can edit pages visually and
give a connected AI agent specific tasks in the same workspace, while keeping
ownership of your website and content.

## Why Blogposter?

If you love the freedom of owning and extending a WordPress website, but want
content, visual design and extensions to follow one coherent system, Blogposter
is being built for you. It is an independent CMS with its own architecture.

- **Build your design visually.** Design Studio, reusable layouts, widgets and
  shared color and typography defaults compose the website. Site Presets supply
  declarative settings; backend features belong in modules, separate from design.
- **Start from existing HTML.** Import a supported page capture as an editable
  Design Studio draft, then refine its layout and content visually.
- **Organize a whole site.** Nested pages, a shared main design and explicit
  page-level design choices keep content separate from its presentation.
- **Extend through clear boundaries.** Modules provide backend capabilities,
  widgets provide reusable UI blocks, and apps provide larger tool surfaces.
  Permission-checked event contracts connect them.
- **Contain extension failures.** Community backend modules run in separate
  processes, with bounded requests and controlled access to host capabilities.
- **Work with an agent in the same CMS.** Supported workspaces expose structured
  state and actions through the existing services, with human preview and review.

Blogposter is for site owners who want visual control and self-hosting, and for
developers who want to extend a documented modular system. If you are exploring
a WordPress alternative and can work with an alpha product, this is the audience
we are building for. WordPress plugins and executable themes do not run here;
content and visual imports have their own [supported paths](docs/modules/importer.md).

**Current limits:** Blogposter is not production-stable yet. Core modules still
share the Node.js host process, and community runners still need additional
OS/container hardening for untrusted marketplace use. Process isolation reduces
the impact of extension failures; it is not a promise that the CMS cannot crash.

[Install preview](docs/server-installation.md) ·
[Explore the architecture](docs/architecture.md) ·
[Build a module](docs/community_module_guide.md)

## Design a connected website

Design Studio brings free placement, flowing layouts and grids into a nested
Section/Container structure. Compose a website main design with a page's own
design and separately authored content, using explicit content areas. Shared
designs provide a reusable website frame while individual pages retain their
own presentation choices.

Style Sources let linked copies share layout and design properties while their
content stays independent. A linked copy starts with a copy of the structure;
later additions and removals do not automatically propagate. Shared color and
typography defaults provide another level of reuse.

This designer is part of the same modular CMS as pages, widgets and agent
workflows. Supported agent actions use the current layout tree, selection,
Style Source relationships and draft revision, then report their outcomes for
review. The aim is to make this depth increasingly intuitive to use; improving
the human editing experience is active work, not a finished usability claim.

Reusable components, visual layouts and AI assistance exist in other builders
too. Blogposter's identity is how it combines design composition, independent
content, modular extension boundaries and human/agent editing in a self-hosted
CMS. See the [source-backed designer comparison](docs/designer-comparison.md)
for the overlaps and the limits of this positioning.

## Bring existing HTML into Design Studio

Start with an existing page or a rendered HTML prototype, including one created
with an AI tool. The HTML importer turns a supported browser capture into an
editable Design Studio draft with Sections, Containers and widgets, so you can
continue working visually inside Blogposter.

The current workflow captures a locally served page at several viewport widths
with the export CLI. In Design Studio, choose **Import HTML capture**, review the
dry-run warnings and import the capture JSON. Edit the result, check it in Preview,
then save and reopen it to review the design.

The result is a measured starting point for further editing. It does not preserve
arbitrary application JavaScript or reconstruct every CSS rule. Unsupported
fragments and capture limitations are reported for review.

See [measured HTML page import](docs/modules/importer.md#measured-html-page-import)
for the capture command, supported format and current limits.

## People and agents, one workspace

The goal is a continuous collaboration: you start something, an agent helps
develop it, and you review and refine the result. Both should work from the
same current content, design and draft state.

## What AI-first means here

Blogposter is being built around shared work between humans and agents:

- **Shared context:** supported workspaces expose their current selection,
  content and unsaved draft so an agent can understand where you left off.
- **Targeted actions:** agents use structured commands for supported editing
  tasks, through the CMS's existing services and permissions.
- **Careful handoffs:** revision checks reject commands based on outdated
  state, and draft guards require agents to acknowledge existing unsaved work.
- **Visible results:** workspaces report command outcomes and updated state so
  changes can be checked before the next step.

For example, the intended workflow is:

1. Start a page and arrange its content in the visual editor.
2. Ask a connected agent to revise a heading or adjust a selected element.
3. Inspect the rendered result in Preview before it goes live, and request or
   make corrections.
4. Once you are satisfied, publish the page yourself or ask the agent to do it.

Making this handoff dependable throughout the CMS is the product direction.
Agent support is already implemented in several workspaces, but coverage is
still incomplete and the full experience is under active development.

In current development use, the agent layer already works quite reliably for
supported workflows, including building and publishing websites. The human-facing
UI still needs refinement, especially the visual website designer. You can
preview the agent's work before publication and review what visitors will see.

## Available agent workflows today

Shared agent actions already cover parts of Pages, the page editor, Navigation,
Media, Libraries, Settings and Design Studio. The Designer provides structured
feedback about layout, selected elements, styles, previews and publishing state.

An external agent connects through Agent Access. These workspace commands
currently require the relevant CMS workspace to be open in a browser. Some
operations, including media uploads, still use their existing human interfaces.
An accepted command is only complete once the workspace reports its outcome.

See [shared human and agent workflows](docs/agent-cms-workflows.md) for supported
actions and current limits, [Agent Access](docs/modules/agentAccess.md) for
connection details, and [Design Studio feedback](docs/design-studio-agent-feedback.md)
for the Designer's agent contract.

## Install Blogposter on your server

Start with the **[server installation guide](docs/server-installation.md)**.
It takes you through downloading and verifying a release, then running
`install-blogposter` to set up **the CMS and its updater together**.

You need a Linux server with systemd, Docker Compose, Node.js 24+ and the tools
listed in the guide. Connect your domain and HTTPS reverse proxy, then open
`https://your-domain/install` to create your administrator account and site.
The combined installer is currently a preview; real Linux installation and
update/rollback acceptance are still pending.

For local development, use the [developer quickstart](docs/developer_quickstart.md).

## Current Status

BlogposterCMS is under active development and is not yet production-stable.
The agent workflows are further along than the UI polish, particularly in
Design Studio. It is usable for development, experimentation and architecture
work, but the data model, builder behavior and extension contracts can still
change between releases.

Existing setups may break during alpha updates. Do not treat this as a stable
drop-in production CMS yet.

## How the CMS is structured

BlogposterCMS is not built around one giant "do everything" extension type.
It separates responsibilities:

- **Modules** own backend capability and run through a permission-checked event
  system.
- **Widgets** render public or admin UI blocks.
- **Apps** provide larger admin/tool surfaces in isolated frames.
- **Site Presets** configure central Builder, color and typography defaults
  without becoming a public runtime.

That separation matters because it keeps authority visible. A widget cannot
quietly become a backend module, a preset cannot introduce executable behavior,
and a community module does not receive the raw Express app.

The core communicates through `motherEmitter`, a JWT-secured event bus.
Community modules use a scoped `moduleHost` facade and run outside the CMS host
process. They can request access to core events, but those requests are
declared in `moduleInfo.json`, reviewed by the admin, and stored as explicit
grants.

## Why Public Pages Feel Fast

BlogposterCMS is designed so public page delivery stays thin.

The public route serves a small HTML shell and injects only the runtime facts a
page needs: page id, slug, lane, public token and nonce. Static assets are served
directly from guarded `/assets`, `/build`, `/widgets` and `/apps` routes. The
browser runtime then composes the page from structured page, layout and widget
data plus the active central color and font defaults.

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
  revisions, previews, Site Presets and translations.
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

## Local development quickstart

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

The default runtime entrypoint is `node app.js`. The development command starts
the existing Node server together with Sass and browser-bundle watchers. Open
development pages receive a local reload signal: changed stylesheets are
replaced in place, while JavaScript, HTML and server restarts trigger a full
reload. Use `npm run dev:server` when only the raw Nodemon server is wanted.

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
