# CMS Usage Guide

This guide describes how to operate BlogposterCMS once the server is running. It covers the dashboard, the two widget lanes, and the JWT event bus that modules use.

## Accessing the Dashboard

1. Start the server using `npm start`.
2. Open `http://localhost:3000/` in your browser.
3. The admin interface lives under `/admin`.
4. If you are accessing for the first time, register or create an admin user via the command line utilities.
5. Log in with your credentials to see the dashboard.

The dashboard allows you to manage pages, users and settings. Only authenticated users with the appropriate role can access it. Always use HTTPS in production so credentials are transmitted securely.

![Login screen](screenshots/Clean%20Login%20Interface.png)

The login screen cycles through the preset accent colors, softly fading the dotted background and form border between each hue.

Elements with `title`, `aria-label`, or `data-label` attributes automatically reveal an animated floating label on hover, mirroring the sidebar tooltip style.

## Button System

Use the global `.button` classes for consistent actions across the dashboard. Variants such as `.primary`, `.ghost`, `.outline`, `.text` and `.danger` cover common intents, while size modifiers `.sm` and `.lg` adjust height. Apply `.block` for full‑width buttons and wrap related actions in a `.button-group` to handle spacing and wrapping. Buttons accept optional icons via a child `.icon` element and expose an `.is-loading` state for spinners.

## Creating Workspaces and Subpages

  The admin interface includes two "+" buttons for quickly adding content. Clicking either reveals a sliding panel where you pick an icon and enter a name before submitting. The button on the left side of the header creates a workspace and the "+" button at the bottom of the sidebar adds a subpage to the current workspace. When the workspace field is open, existing workspace links are hidden and the "+" icon switches to a "-" so you can click it again to close the panel. The subpage button behaves the same way, hiding its label while the field is open. Each inline field now slides out beside its trigger button and overlays surrounding content with a high z-index. The panel includes an icon chooser on the left, a centered text input, and a corner-down-right confirmation button on the right.
  The icon chooser loads the complete list of available icons from `/assets/icons` on demand and displays them in a floating grid. After selecting an icon the grid closes automatically and it also collapses when you confirm, which immediately creates the workspace or subpage.

## Admin Lane vs Public Lane

BlogposterCMS separates widgets and pages into **admin** and **public** lanes:

- **Public lane** pages are visible to regular visitors.
- **Admin lane** pages are only accessible in the dashboard for editing and management tasks.

Each lane has its own widget registry so that sensitive admin widgets are never loaded on the public site. If a page is misconfigured and tries to request admin widgets while rendering publicly, the renderer forces the lane back to `public` for security.

## Widgets Overview

Widgets are small blocks of functionality (text blocks, images, counters, etc.) that you can place on pages. They are stored in the database through the `widgetManager` module.

- Widgets registered for the **public** lane render on live pages.
- Widgets registered for the **admin** lane appear in the dashboard for building pages or showing statistics.

Layouts and widgets are edited via drag and drop in the admin dashboard. While in edit mode, open the widget drawer and drag widgets onto the grid to place them. The widget manager ensures only users with the appropriate permissions can create or modify widgets.
When edit mode is active, the content header shows quick action buttons on the right. Use the grid icon to toggle the widgets panel and the X icon to delete the current admin page.

Widgets can provide layout hints when seeded. Administrators may specify width
and height options such as `halfWidth`, `maxHeight` or `overflow` so the initial
layout matches the desired size. All built-in admin widgets ship with sensible
defaults for their width and height so a freshly seeded dashboard is usable
immediately.

Widgets are arranged with a CanvasGrid drag-and-drop layout. Its twelve columns automatically resize to fill the available space, preventing dead zones at the edges. The sequence below demonstrates arranging widgets from an empty grid to a customized dashboard.

Each widget now includes a resize toggle to switch between a small four-column width and a large eight-column width, making layout adjustments quick and intuitive.

![Initial grid view](screenshots/Arrange%20Your%20Dashboard%20Freely.png)
![Adding widgets](screenshots/Perfectly%20Adaptive%20Widgets.png)
![Final layout](screenshots/Your%20Dashboard,%20Your%20Way.png)

## Module System and JWT Event Bus

All features communicate through the *meltdown* event bus. Events are signed with JSON Web Tokens (JWTs) to enforce permissions. The `motherEmitter` verifies each token before allowing a module to perform an action. Core modules receive high-trust tokens while optional modules run with lower trust levels.

Example event call:

```js
motherEmitter.emit('dbSelect', {
  jwt,
  moduleName: 'myModule',
  moduleType: 'community',
  table: 'posts',
  where: { id: 1 }
}, callback);
```

The callback receives results only if the token has the `db.read` permission. This design prevents rogue modules from executing unauthorized database actions.

## Building a Module

1. Create a new folder under `modules/`.
2. Add an `index.js` that exports an `initialize({ motherEmitter, jwt, isCore })` function.
3. Inside `initialize`, register any meltdown event listeners your module needs.
4. Include a `moduleInfo.json` file describing your module. It must define `moduleName`, `version`, `developer` and `description`; other properties like permissions are optional.
5. Restart the server. The Module Loader will automatically attempt to load the new module inside its sandbox.

Modules should only interact with the rest of the CMS through meltdown events. Refer to existing core modules for practical examples.


## Page Hierarchy (No PostType)

BlogposterCMS does not use a traditional `post.type` column. Instead content is organized by nesting pages. When creating a page you may supply `parent_id` to specify its parent. For example, create a page called `Blog` and then create "How to create a page in BlogposterCMS" with `parent_id` set to the Blog page's ID. The second page becomes a subpage. A future update will allow attaching custom fields to the parent; all subpages will automatically inherit values from those fields.

## Page Builder and Lightweight UI


The admin lane provides a drag‑and‑drop page builder at `/admin/builder`. The builder retrieves the widget registry via `widget.registry.request.v1` and loads widgets dynamically. Because it relies on minimal JavaScript and CSS, the interface remains lightweight and quick to load even on modest devices.

Text and colour tools open in a fixed column between the sidebar and canvas so the layout shifts naturally without overlaying the design. The panel markup is loaded from `apps/designer/partials/builder-panel.html` and controlled by `panelManager.js` to keep the renderer lean.

A dropdown attached to the Save button lets you enable or disable autosave without leaving the toolbar.

The canvas opens centered in the viewport at a 100% zoom level and can expand up to 4K widths, with the scroll container resizing as the canvas grows so horizontal and vertical scrollbars appear when layouts overflow. Even when zoomed out, the zoom sizer keeps the canvas centered so it no longer drifts to the side.

### Publishing layouts

Clicking **Publish** in the builder opens a side panel beneath the Publish button on the right where you can search existing public pages by slug. Suggestions are limited to the public lane; if the entered path doesn't match an existing public page, the list displays “+ Add page” and the panel notes that a page will be created with the design applied. You may choose to create the page as a draft, and a red notice reminds you that draft pages aren't publicly accessible.
Publishing first saves your current layout template, then creates the page if necessary and attaches the design using the same logic as the Page Content widget so changes show up immediately.
Click **Publish** again or use the panel's close button to dismiss it.

### Widget CSS Layers

Each widget is rendered inside a Shadow DOM to isolate its styles. The builder injects three CSS layers in this order:

1. **Admin styles** – `/assets/css/site.css` provides baseline rules for the dashboard and is imported first.
2. **Widget styles** – any custom CSS defined for the widget itself is added next inside the shadow root.
3. **Active theme** – the current theme’s `theme.css` is imported last so themes can override previous layers.

This layering keeps widgets secure from style collisions while allowing themes to customize their appearance. When using the page builder, the active theme is scoped to the preview grid so you can see changes live without the builder interface inheriting those styles.

### Color Picker

The builder's colour picker now scans only the active builder grid, listing colours actually used in your layout instead of the whole page. Your most recent selection always appears first in the **Custom colours** row and is pre‑selected when reopening the picker. Clicking the “plus” button opens a pop‑in hue editor directly beneath the chosen swatch, where you can fine‑tune the hex value or pick a new shade. A search field still accepts hex or common colour names to jump straight to a specific value.

## New Features in v0.5.0

- **Permission Groups** – manage permissions using reusable groups in the Users settings. The old Permissions page has been removed.
- **Layouts Page** – create layout templates under `/admin/layouts` and apply them when building pages.
- **Notification Hub** – click the Blogposter logo in the header to view recent system notifications.
- **Widget Templates** – save widget configurations for later reuse from the Templates tab in the widget list.
