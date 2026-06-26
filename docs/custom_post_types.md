# Custom Post Types

BlogposterCMS organizes content using **nested pages** instead of fixed post types.
Each page can act as a parent that defines the layout and fields for its children.
This flexibility means you rarely need a separate "custom post type" concept.

## How It Works
1. Create a parent page (for example `Blog` or `Events`).
2. Assign your layout and custom fields on the parent.
3. Add subpages – these become your posts or entries.
4. The children automatically inherit the parent layout and fields.

This approach simplifies security because the CMS only needs to validate one kind of page object.
Developers still get predictable data structures, while editors can organize content however they like.

## Why No Custom Post Types?
- Fewer moving parts reduce the attack surface.
- Layout inheritance keeps your pages consistent without extra configuration.
- Nested pages can represent blogs, portfolios or galleries – you decide.

If you really need specialised behaviour, you can still create modules that listen to page events and add features.
But for most cases, nested pages provide the same flexibility with less complexity.
