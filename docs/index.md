# BlogposterCMS Documentation

BlogposterCMS is an **open-source Node.js content management system** built with security in mind.
This folder provides additional information on installing, configuring and extending the system. The files are grouped by topic for easier navigation.

- [Installation](installation.md)
- [Module Architecture](modules.md)
- [Community Module Guide](community_module_guide.md)
- [Permission System](permission_system.md)
- [Per-module Reference](modules)
- [Agent Access](modules/agentAccess.md)
- [Agent Manager](modules/agentManager.md)
- [Architecture Overview](architecture.md)
- [Server Composition](server_composition.md)
- [UI Architecture](ui_architecture.md)
- [Event-First Transport Boundary](event_first_transport.md)
- [Workboard](workboard.md)
- [Security Notes](security.md)
- [CMS Usage Guide](guide.md)
- [Developer Quickstart](developer_quickstart.md)
- [Configuration Overview](configuration.md)
- [Meltdown Event Bus](meltdown_event_bus.md)
- [Notification System](notification_system.md)
- [Global DOM Events](global_events.md)
- [How Login Strategies Work](how_login_strategies_work.md)
- [Custom Post Types](custom_post_types.md)
- [Permission Groups](permission_groups.md)
- [Layout Templates](layout_templates.md)
- [Theme Contract](theme_contract.md)
- [Widget Design Contract](widget_design_contract.md)
- [Grid Core](grid_core.md)
- [CanvasGrid](canvasgrid.md)
- [PixelGrid](pixelgrid.md)
- [Community Widgets](community_widgets.md)
- [Changing the Render Engine](changing_render_engine.md)

For the full project overview and sarcasm-filled introduction, see the main [README](../README.md).

## Q&A

**Where do I configure login strategies?**

Login strategies are handled by the [Auth Module](modules/auth.md). To create your own or integrate OAuth providers, see [How Login Strategies Work](how_login_strategies_work.md).

**Do I need OAuth to use BlogposterCMS?**

No. The built-in `adminLocal` strategy provides username/password authentication. OAuth strategies are optional and can be enabled or disabled individually.
