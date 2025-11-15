# Changelog

All notable changes to BlogposterCMS are documented here. This condensed log only calls out the user-facing highlights. For a play-by-play development diary, see `DEV_DIARY.md`. 

El Psy Kongroo

## [Unreleased]
- Nothing yet.

## [0.7.0] – 2025-11-15

### Highlights
- Admin header now surfaces maintenance mode with a persistent banner, dropdown offsets, and a one-click disable flow so outages can be ended without touching the server.
- The builder gained a dedicated layout mode with tree navigation, container action bars, previews, and history-aware layout serialization, letting authors rearrange structure separately from widgets.
- First-run setup now ships a multi-step install wizard, strong credential enforcement, and prominent quickstart docs so new projects bootstrap safely with unique secrets.
- Public rendering now consumes the same layout and design APIs as the builder, merging page content, shared designs, and uploaded HTML with deterministic ordering for consistent output.

### Admin & Setup
- Workspace navigation was hardened: trailing slashes are normalized, nested paths keep their icons, workspaces expose inline create flows, and slugs respect full paths so nested deployments stay navigable.
- Dashboard styling adopted opaque panels, accent-aware widgets, and a refreshed header so maintenance banners, breadcrumbs, and quick actions line up with the new design system.
- Content tooling now includes Access Control and Audit Log pages, a Page Content widget that attaches designs or HTML with previews, a layout gallery that links straight into the builder, and a favicon picker fed by the media explorer.
- Admin quickstart instructions, README guidance, and install routes now explicitly require completing the setup wizard before `/admin` becomes available, reducing support traffic from half-configured instances.

### Builder & Designer
- Text tools ship ready-made heading/subheading/body presets, skeleton placeholders while partials load, unified text/background color pickers, and quick alignment cycling so authors can compose copy faster.
- Layout mode renders a persistent `#layoutRoot`, scroll-synced container tree, drag-to-arrange controls, workarea toggles, and per-container design assignments with autosave and undo/redo support.
- Publishing now saves layouts before page creation, offers slug suggestions with draft warnings, lets admins create slugs inline through `pageService`, and auto-uploads previews through `capturePreview`.
- CanvasGrid improvements cover cached column widths, zoom sizers, smooth drag/resize previews, deterministic percentage sizing, and bounding-box orchestration via shared grid-core modules so large canvases stay responsive.

### Platform & Runtime
- New designer events (`designer.listDesigns`, `designer.getDesign`, `designer.listLayouts`, `designer.getLayout`) plus the envelope orchestrator power both the builder and the public runtime with the same data flow.
- `pageService`, weight-based navigation, reserved slug enforcement, and workspace-aware seeding keep admin menus, headers, and public routes in sync while preventing collisions with protected paths.
- Install and runtime security were upgraded with RSA origin tokens for the designer iframe, sanitized page loaders that only execute trusted scripts, strict environment variable validation, and forbidden username checks.
- Module loader and widget pipelines gained lazy import fixes, deterministic asset paths, and dynamic widget registries so removing or relocating apps (including the standalone designer) no longer breaks dashboards.

### Testing & Docs
- Added jsdom regression suites covering delayed sidebar mounts, `/admin` fallbacks, overlapping Plainspace seeds, and layout hydration so core admin experiences stay covered.
- CanvasGrid and layout documentation now outline responsive builder settings, seeding guidelines, and grid-core helpers while new developer quickstart sections highlight install wizard requirements and secret rotation.


**“Whenever I’m about to do something, I think:
‘Would an idiot do that?’
And if they would, I do NOT do that.

…This release is not that.”**
– Dwight Schrute, Assistant (to the) Regional Developer
