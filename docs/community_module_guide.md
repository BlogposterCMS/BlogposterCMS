# Community Module Guide

This guide explains how to build a BlogposterCMS community module in the
simplest practical way.

## WordPress Add-On Vs Blogposter Module

In WordPress, an add-on is usually a PHP folder with a package header. It hooks
into WordPress actions and filters, checks capabilities with functions such as
`current_user_can`, and may create database tables on activation.

In BlogposterCMS, a community module is a folder under `modules/` with:

- `moduleInfo.json` for metadata, declared module-owned permissions and
  requested core event access.
- `index.js` exporting `initialize(...)`.
- optional `frontend/` static files registered through `moduleHost`.
- module-owned data stored through `moduleHost.storage`.

The important difference: a Blogposter community module does not get raw server
access. It runs in a separate process and can only use the host APIs it is
given.

## Why Blogposter Uses Clear Extension Types

BlogposterCMS intentionally does not have a catch-all extension type.

The broad WordPress add-on model can mean backend logic, admin UI,
frontend widgets, cron jobs, database tables, theme helpers or almost anything
else. Blogposter splits those responsibilities into clearer add-on types:

- **Modules** add backend capability and own server-side contracts.
- **Widgets** render small public or admin UI blocks.
- **Apps** provide larger isolated admin/tool surfaces.
- **Themes** change presentation, not behavior.

So when someone asks how to build a WordPress-style add-on, the Blogposter answer is:
choose the type by what you are building.

| What you want to build | Use this |
| --- | --- |
| Backend logic, custom data, background sync, API/event contracts | Module |
| A reusable page block or dashboard block | Widget |
| A larger admin tool with its own screen | App |
| A visual skin or frontend styling package | Theme |

This keeps permissions and security understandable. A public widget cannot
quietly become backend code, a theme cannot mutate users, and a community
module cannot pretend to be a core module. If a module needs access to a core
event, it must declare `requestedAccess` and the admin must approve it during
install, activation or a one-time runtime prompt.

For the complete difference between user permissions and module event grants,
read the [Permission System](permission_system.md) guide.

## Minimal Folder

Create this structure:

```text
modules/
  helloModule/
    moduleInfo.json
    index.js
```

## moduleInfo.json

```json
{
  "moduleName": "helloModule",
  "version": "1.0.0",
  "developer": "Your Name",
  "description": "Small demo module",
  "permissions": [
    {
      "key": "helloModule.read",
      "description": "Read Hello Module data"
    }
  ],
  "requestedAccess": [
    {
      "event": "listContentEntries",
      "reason": "Show existing content entries in the module UI"
    }
  ]
}
```

Rules:

- `moduleName` must match the folder name.
- Community permission keys must start with the module name, such as
  `helloModule.read`.
- A module must not declare core permissions such as `users.delete`,
  `modules.install`, `settings.core.edit`, `*` or `canAccessEverything`.
- `requestedAccess` is only a request. The admin can approve it during
  install or activation before it becomes a permanent runtime grant.
- Events that were not permanently granted stay blocked until the runtime
  one-time approval prompt approves one exact call.
- User, role, permission, module, settings, auth and app-management events are
  high-risk. They must not become broad permanent module grants.

## index.js

```js
module.exports = {
  async initialize({ eventBus, moduleHost, moduleInfo }) {
    await moduleHost.storage.insert('messages', {
      title: 'Hello from the module',
      createdAt: new Date().toISOString()
    });

    eventBus.emit('helloModule.ready', {
      version: moduleInfo.version
    }, () => {});
  }
};
```

Use `moduleHost.storage` for your own tables. The host maps a logical table
such as `messages` to an isolated physical table for this module. Do not emit
raw `dbInsert`, `dbUpdate`, `dbDelete` or raw SQL events.

## Reading Your Own Data

```js
module.exports = {
  async initialize({ eventBus, moduleHost }) {
    eventBus.on('helloModule.getMessages', async (payload, callback) => {
      try {
        const rows = await moduleHost.storage.select('messages', {});
        callback(null, rows);
      } catch (err) {
        callback(err);
      }
    });
  }
};
```

Community listeners must use module-owned event names such as
`helloModule.getMessages`. They cannot subscribe to system events or events
owned by other modules.

## Calling Approved Core Events

If the module declared and the admin approved this:

```json
{
  "requestedAccess": [
    { "event": "listContentEntries", "reason": "Show content entries" }
  ]
}
```

then the module may call:

```js
eventBus.emit('listContentEntries', {
  limit: 20
}, (err, entries) => {
  if (err) {
    console.error(err.message);
    return;
  }
  console.log(entries);
});
```

Without permanent approval, the host blocks the event during health check. At
runtime it opens a one-time admin prompt. If the admin denies or the prompt
expires, the call fails.

## Static Frontend Files

Create:

```text
modules/
  helloModule/
    frontend/
      index.html
      hello.js
```

Register them:

```js
module.exports = {
  async initialize({ moduleHost }) {
    const mount = await moduleHost.registerStaticAssets({
      dir: 'frontend',
      mountPath: '/'
    });

    console.log(`Static files mounted at ${mount.mountPath}`);
  }
};
```

Files are always mounted below `/modules/<moduleName>`. The host rejects
traversal, symlinks, package manifests, lockfiles, `.env*` files and raw
TypeScript source requests.

## Installing A Module

For local development:

1. Put the module folder under `modules/`.
2. Restart the CMS.
3. The Module Loader validates the folder, runs a health check in a runner
   process and starts the module if it passes.

For ZIP installation:

1. ZIP one module folder.
2. Upload it in the Modules admin page.
3. The admin UI inspects `moduleInfo.json`.
4. The UI shows declared permissions and requested core event access.
5. The admin approves permanent access or denies each requested event.
6. Only approved events become permanent runtime grants.
7. Anything not permanently granted uses the one-time approval flow before
   the host may allow that exact core event call.

## What Not To Put In A Module

Do not include:

- `app.json`
- `widgetInfo.json`
- nested `moduleInfo.json`
- `node_modules`
- `package.json` or lockfiles
- `.env*`
- top-level host folders such as `apps/`, `widgets/`, `ui/`, `mother/` or
  `public/`

Apps and widgets use their own loaders. A module owns backend capability, not
admin iframe apps or public widget packages.

## Debugging Checklist

- Folder name and `moduleInfo.moduleName` are identical.
- `index.js` exports `initialize`.
- Permission names start with `<moduleName>.`.
- Requested core events are documented and approved in the admin UI.
- System events such as user deletion, role edits, module install or settings
  edits are one-time only and cannot become permanent grants.
- Own data uses `moduleHost.storage`.
- Static files are registered with `moduleHost.registerStaticAssets`.
