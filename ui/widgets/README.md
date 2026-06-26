# Widgets

Target home for the widget SDK, bundled widgets, and future sandbox adapters.

Widgets should communicate through explicit capabilities instead of direct
server or global state access.

Reusable widget sizing and rendering helpers live here so Runtime and Shell can
consume them without creating reverse dependencies. Widget code must not import
Runtime, Shell, or Designer modules.
