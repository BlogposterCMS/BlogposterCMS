# Permission System

This guide explains how BlogposterCMS decides what a user, module or admin UI
action may do.

## Short Version

Permissions flow through one clear path:

1. User Management owns the permission catalog.
2. Permission groups store reusable bundles of permission keys.
3. Users receive permission groups and optional advanced direct rights.
4. Login merges the user's groups into the JWT permission payload.
5. Core modules and admin routes check that JWT before sensitive work.
6. Community modules may declare only their own permission keys. Anything that
   crosses into core CMS authority needs explicit consent.

The admin UI must not create random permission JSON. It should always use the
catalog returned by `getAllPermissions`.

## Main Pieces

| Piece | What it means |
| --- | --- |
| Permission key | A dotted capability name such as `pages.read` or `users.delete`. |
| Permission catalog | The known list of permission keys, labels and descriptions. |
| Permission group | A reusable role-like bundle of permission keys. |
| Direct user right | An advanced checkbox exception assigned to one user. |
| Login token | The JWT containing the merged permissions for the current session. |
| Runtime check | A backend check that requires a specific permission key. |
| Module access grant | Admin-approved permission for a community module to call a specific core event. |
| Permanent grant | A grant saved for a module during install or activation. |
| One-time grant | A runtime grant for one exact module action, consumed after that call. |

## Permission Keys

Permission keys are plain dotted strings. Core keys describe core CMS
capabilities:

```text
pages.read
pages.update
widgets.manage
modules.install
users.delete
settings.core.edit
```

The built-in admin role has `'*': true`. That broad bypass is reserved for
reviewed administrator groups and is not assignable as a direct checkbox right
on a single user. Startup normalizes retired broad keys out of stored admin
role payloads.

## Where The Catalog Comes From

User Management seeds the default core permission catalog during startup. The
catalog is read through `getAllPermissions` and used by the admin UI for
checkboxes.

Community modules may extend the catalog through `moduleInfo.permissions`, but
only inside their own namespace:

```json
{
  "moduleName": "shopSync",
  "permissions": [
    {
      "key": "shopSync.read",
      "description": "Read Shop Sync data"
    },
    {
      "key": "shopSync.sync",
      "description": "Run Shop Sync"
    }
  ]
}
```

They must not declare core permissions such as `users.delete`,
`modules.install`, `settings.core.edit`, `*` or retired broad keys.

Important: declaring `shopSync.sync` only creates a permission key that admins
can assign to users. It does not give the module access to core user, settings
or module-management events.

## Permission Groups And User Checkboxes

When creating or editing a user, the admin UI assigns access in two layers:

1. Select permission groups for normal reusable access.
2. Optionally open advanced rights and select individual permission keys.

Direct advanced rights are not stored as free-form JSON on the user. User
Management stores them as an internally managed per-user role and assigns that
role through the normal `user_roles` path. That keeps login, token generation
and runtime permission checks on one existing mechanism.

Use groups for normal access models such as editor, media manager or
administrator. Use direct rights only for small exceptions.

## What Happens On Login

After a user logs in, `finalizeUserLogin` loads the user's assigned roles,
merges their permissions and signs them into the session JWT.

Runtime checks then use that JWT:

```text
User action -> JWT permissions -> backend requires pages.update -> allowed or rejected
```

If the permission is missing, the backend should fail closed with a forbidden
or missing-permission error. The user usually needs to log in again after an
admin changes their rights, because older tokens can still contain the previous
permission payload until refreshed.

## Community Modules And Admin Consent

Community modules have two different security concepts:

| Concept | Declared in | Meaning |
| --- | --- | --- |
| Module-owned permission | `moduleInfo.permissions` | Adds keys such as `shopSync.sync` to the catalog so admins can assign them to users. |
| Requested core action access | `moduleInfo.requestedAccess` | Asks for permission to call one documented `{ resource, action }` facade action, either permanently or once. |

Example:

```json
{
  "moduleName": "shopSync",
  "permissions": [
    { "key": "shopSync.sync", "description": "Run Shop Sync" }
  ],
  "requestedAccess": [
    {
      "resource": "content",
      "action": "list",
      "reason": "Show existing content entries before syncing"
    }
  ]
}
```

During install or access review, the admin UI shows declared actions and stores
approved grants in the registry. Runtime calls reread those grants. Undeclared,
unapproved or revoked actions fail closed; one-time runtime prompts are no
longer an authorization path. The approving administrator needs both
modules.manageAccess and the target permission. Package metadata cannot supply
trusted grants or give the module an administrator token.

Protected user, role, permission, module, settings, auth and app-management
operations cannot be granted to community code. Use the trusted administration
surface for those operations. The [runtime sandbox](community-isolation.md)
prevents bypassing the event boundary with direct file or network access.

## Confirmation Rules

| Situation | What happens |
| --- | --- |
| Admin deletes a user in the UI | The current user needs `users.delete`, and the UI should show a destructive confirmation. |
| Community module asks for any core event without a grant | The host blocks it by default. |
| Community module asks for an approved event | The host rechecks its declaration and current registry grant before dispatch. |
| Community module asks for a grantable event without approval | The call is blocked; an administrator can review the manifest in Modules. |
| Community module asks for a protected security action | The call stays blocked. |
| Module declares `shopSync.sync` | The key can appear in user/group permission checkboxes after validation. |
| User gets `shopSync.sync` | That user may use UI/API surfaces that explicitly require that key. |

So the rule is default deny:

- Module-owned sandbox work can run inside the module boundary.
- Core CMS work needs a declared, currently approved registry grant.
- High-risk security administration must not become a permanent community
  module capability.

## Building Against The System

For core CMS work:

- Reuse existing permission keys where possible.
- Add a new core permission only when a real new capability needs to be
  assigned separately.
- Check permissions at the backend boundary before mutating data.
- Use searchable error messages for missing or invalid permissions.

For community modules:

- Use permission keys that start with your module name, such as
  `shopSync.read`.
- Put those keys in `moduleInfo.permissions`.
- Put cross-core event needs in `moduleInfo.requestedAccess` with a clear
  reason.
- Treat user, role, permission, module, settings, auth and app management
  events as protected. They are unavailable to community code.
- Store your own data through `moduleHost.storage`.

For admin UI:

- Load checkbox options from `getAllPermissions`.
- Let admins select groups first.
- Put individual permission checkboxes under advanced rights.
- Do not expose raw permission JSON editing.
- Use confirmation dialogs for destructive human actions.

## Debugging Checklist

- Is the permission key present in `getAllPermissions`?
- Is the key assigned through a permission group or direct advanced right?
- Did the user log in again after the access change?
- Does the backend check the same key the UI assigned?
- Is a broad admin bypass being assigned only through a reviewed admin group?
- For community modules, does the permission key start with the module name?
- For community modules, was the requested event approved during install or
  activation?
- Is the requested event protected and therefore intentionally not permanently
  grantable?

## Related Docs

- [Permission Groups](permission_groups.md)
- [User Management](modules/userManagement.md)
- [Community Module Guide](community_module_guide.md)
- [Module Architecture](modules.md)

### Account editor advanced rights

Permission groups remain on the account form. **Edit advanced rights** opens the
shared dialog with grouped, searchable direct rights. Group-inherited access is
unchanged. **Apply changes** stages the dialog draft; **Cancel**, Escape or backdrop
dismissal drops that draft. **Save user** persists through the existing user access
service; **Discard changes** restores the last saved selection. Existing direct
keys absent from the current registry remain preserved when editing other rights.
