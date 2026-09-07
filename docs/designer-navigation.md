# Navigation in Design Studio

For a complete editable frame, use the [optional Docs example](docs-example.md)
from **Content → Pages → Import example**. It starts as drafts, independently of
the website's main design.

Insert **Navigation → Menu**, **Sidebar menu** or **Breadcrumb**, select the
element, then open its **Content** inspector, alongside the existing Gallery
and Collection settings. These are the existing public
widgets; their settings are stored in the selected placement's `code.meta`
and saved with the same Designer document.

## Menus

Choose a registered menu source and use **Edit menu links** to open Navigation
Studio. The source owns labels, destinations, ordering and nesting. The Designer
owns horizontal/vertical direction, link appearance, alignment, text size,
spacing, corner radius, depth and mobile collapse. Changing appearance preserves
existing inline links; explicitly choosing a managed source replaces them.
Studio reads active menu links through its existing authenticated AppLoader
facade. Public rendering retains the existing public navigation endpoint.
While editing, clicking a canvas link selects its widget without leaving Studio.
Preview restores normal link navigation; submenu buttons remain interactive.

Submenu arrows are separate from page links. Enter/Space activates their normal
buttons; Escape closes a submenu and returns focus to its arrow. The current
page receives `aria-current="page"`. Mobile navigation uses a labelled disclosure
button. Auto/Grid containers let these widgets grow with expanded links; Free
placement retains the authored canvas dimensions.

Legacy mega-menu references remain in item metadata. Their child links render
as disclosures; a referenced custom mega-design is not a new runtime in this
widget. The previous internal "Mega panel" placeholder is no longer public copy.

## Breadcrumbs

**Page hierarchy and titles** follows the current published page's actual parent
IDs, including parents whose slugs are not path prefixes. Public lookups stop
at missing/unpublished/private parents and reject cycles or depth above 16.
Only the public facade is used, including while previewing from Studio; admin
credentials are never substituted. Without public lookup context, Studio shows
the **Preview path**, while public pages always use their real current path.

Configure start label/address, start visibility, separator, alignment, size and
spacing. A Docs start address such as `/docs` trims ancestors above that page.
An unavailable lookup leaves the usable URL trail and reports
`BP_WIDGET_BREADCRUMB_PAGES_UNAVAILABLE`. Choosing **URL path** avoids lookups.
Explicit legacy `items`/`trail` remain readable; choosing a source replaces them.

## Agents

Use the existing `studio.designer` surface and `navigation.configure` with an
instance `id`, `settings`, current `expectedRevision`, and `acceptDraft` when
needed. The shared draft guard, save and publish actions still apply.

```json
{
  "action": "navigation.configure",
  "params": {
    "id": "docs-menu-instance",
    "settings": {
      "locationKey": "docs",
      "orientation": "vertical",
      "appearance": "soft",
      "mobileCollapse": true,
      "mobileLabel": "Chapters"
    }
  }
}
```

Read `feedback.widgetPlacements[].navigation` for flat normalized settings, source
ownership and inline-item status. Configure presentation here; manage menu
items through the existing Navigation Studio actions. This is not another menu
database or agent transport.
