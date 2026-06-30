# Permission Groups

Permission groups bundle multiple permissions under a single reusable name.
They sit on top of the canonical permission catalog maintained by User
Management.

For the full model, including login-token merging and community module access
grants, read the [Permission System](permission_system.md) guide.

## Managing Groups

1. Open **Settings** in the admin dashboard.
2. Under **Users**, open the permission group view.
3. Add or edit reusable groups for common access bundles. Permission keys come
   from the existing catalog seeded by User Management and extended by
   validated module-owned permission declarations.
4. Save the group. It appears alongside the built-in `admin` and `standard`
   groups.

System groups are locked and cannot be removed. Custom groups may be edited or
deleted at any time.

## Assigning Groups To Users

When creating or editing a user, select one or more permission groups with
checkboxes. For exceptions, open **Advanced rights** and select individual
permission keys from the existing catalog.

Direct checkbox rights are stored as an internally managed per-user role, so
login tokens continue to use the same role-permission merge path as ordinary
groups. Do not create arbitrary permission names in the user form. Core
permissions are seeded by `getAllPermissions`, and community modules may add
only module-owned names such as `shopSync.sync`.

Wildcards such as `*` and retired admin bypass keys are intentionally not
assignable as direct user rights. Use a reviewed admin group for broad
administrator access.
