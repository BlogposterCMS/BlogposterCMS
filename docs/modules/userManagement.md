# User Management

## Boundaries

User Management is a core identity, permission and account module. Browser
registration and login flows are routed through scoped public/core contracts;
admin user and role mutations require explicit permissions. Apps, widgets and
community modules must not emit user-management CRUD events directly or bypass
Auth token lifecycle rules.

Provides CRUD operations for users and roles and handles login sessions.

## Startup
- Core module that ensures its own database, default roles and default permission catalog.

## Purpose
- Manage users and their roles.
- Handle login and registration events.
- Seed the canonical core capability surface used by backend modules.
- Keep the built-in admin role compatible with the current wildcard permission model.

## Listened Events
- `createUser`
- `publicRegister`
- `getAllUsers`
- `deleteUser`
- `getUserDetailsByUsername`
- `getUserDetailsById`
- `getUserCount`
- `updateUserProfile`
- `createRole`
- `getAllRoles`
- `updateRole`
- `deleteRole`
- `assignRoleToUser`
- `getRolesForUser`
- `removeRoleFromUser`
- `incrementUserTokenVersion`
- `createPermission`
- `getAllPermissions`
- `userLogin`
- `finalizeUserLogin`

Passwords are hashed using bcrypt and all events validate permissions before modification.
All internal user-management events require `moduleName: "userManagement"`,
`moduleType: "core"` and a valid JWT. Public registration is the exception in
terms of caller intent, but it is still routed through the scoped
`userManagement` core contract with a verified public token. Token-version
mutation (`incrementUserTokenVersion`) is permission-gated and scoped the same
way because it invalidates existing user sessions.

## Default Roles

`ensureDefaultRoles` creates two built-in roles:

- `admin` is a system role and receives both `'*': true` and the legacy `canAccessEverything: true` flag.
- `standard` is the default basic role and starts with no explicit permissions.

Existing admin roles are self-healed during startup. If an older installation only has `canAccessEverything`, the role is updated to include the wildcard permission that current modules use.

## Default Permissions

`ensureDefaultPermissions` seeds a central permission catalog instead of only the original builder/settings permissions. The catalog covers the active core domains:

- settings and unified settings
- builder and publishing
- content types, entries, publishing and trash/restore
- comments, navigation, SEO, search, redirects, media and metadata
- pages, PlainSpace, widgets, modules, apps, importers, exporters, themes, users, roles, server locations, sharing and translations

The seed step is idempotent: existing permission records are not inserted again, so custom labels or role assignments remain untouched.
