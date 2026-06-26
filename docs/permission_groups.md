# Permission Groups

Permission groups bundle multiple permissions under a single name. They were introduced in version 0.5.0 and replace the old Permissions page.

## Managing Groups

1. Open **Settings** in the admin dashboard.
2. Under the **Users** section, click **Permission Groups**.
3. Add a group by providing a JSON array of permissions, for example:
   ```json
   ["pages.read", "pages.write", "widgets.edit"]
   ```
4. Save the group. It will appear in the list alongside the built‑in `admin` and `standard` groups.

System groups are locked and cannot be removed. Custom groups may be edited or deleted at any time.

## Assigning Groups to Users

When creating or editing a user, choose a permission group from the drop‑down. The user inherits all permissions defined in that group. Multiple groups may be selected for advanced setups.

Using groups simplifies permission management and reduces the risk of misconfigured roles.
