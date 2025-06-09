[![Tests](https://github.com/m41130/BlogposterCMS/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/m41130/BlogposterCMS/actions/workflows/ci.yml)
![ALPHA status](https://img.shields.io/badge/status-alpha-red)

# 🚀 BlogposterCMS

**Composable Modular Sandbox**

- **Composable:** Build exactly what you need.
- **Modular:** Every component isolated and interchangeable.
- **Sandbox:** Secure and controlled from the first module.

Forget CMS. Think Composable.

```bash
git clone [(https://github.com/m41130/BlogposterCMS)]
cd BlogposterCMS
npm install
npm run build
cp env.sample .env
npm start
```
This manual setup is the safest way to get started until an official CLI is released.
```

⚠️ This project is experimental alpha software. Expect breaking changes.

![BlogposterCMS logo](./BlogposterCMS/public/assets/logo/logo_blogposter_min_transparent.png)

📚 Full documentation lives in [`docs/index.md`](./docs/index.md) – your entry point for installation, architecture, security and developer guides.

> "The last CMS you'll ever fork."
> BlogposterCMS is what happens when a dev snaps after one too many WordPress updates.

**BlogposterCMS** is an **open-source, self-hosted Node.js content management system** built for security and speed.
It lets you run modern blogs and websites without sacrificing control. Every feature is a module. Every module is sandboxed. Every action is validated.
You get the power of plugins — without the plugin drama.

- 🧩 100% modular (every feature is optional)
- 🔐 JWT-secured event system (no rogue code allowed)
- ⚙️ Built-in sandbox for third-party modules (crash protection included)
- 🛡️ Hardened security layer with granular permissions
- 📦 PostgreSQL, MongoDB or SQLite – you choose
- 💠 Drag-and-drop pages thanks to [GridStack](https://gridstackjs.com/)
- 🧠 AI & Microservices support (because why not?)
- ☢️ Meltdown event bus keeps rogue modules isolated
- 🔑 Dynamic login strategies and secure share links
- 📦 Dependency whitelisting for safe requires
- 🌐 Lightweight design for fast, SEO-friendly pages

## UI Screenshots

<details>
<summary>Screenshots</summary>

Below are a few snapshots of the BlogposterCMS interface.

![Login screen with username and password fields](docs/screenshots/Clean%20Login%20Interface.png)

These next images illustrate how GridStack lets you arrange widgets within the admin dashboard from a blank grid to a personalized layout.

![Empty dashboard grid before adding widgets](docs/screenshots/Arrange%20Your%20Dashboard%20Freely.png)
![Dashboard grid while adding widgets](docs/screenshots/Perfectly%20Adaptive%20Widgets.png)
![Dashboard grid with arranged widgets](docs/screenshots/Your%20Dashboard,%20Your%20Way.png)

</details>

---

Looking for actual instructions? Start with the [documentation index](docs/index.md). You'll find guides on installation, configuration, module architecture, developer quickstart and, of course, pages of security notes. Replace those placeholder secrets in `.env` or the event bus will mock you.

Fancy tricks like dynamic login strategies, the meltdown event bus, or safe dependency loading are explained there too. Basically, if you’re looking for details, consult the docs.

For a minimal example of how to build your own module, check out [`modules/dummyModule`](./BlogposterCMS/modules/dummyModule) and its [documentation](docs/modules/dummyModule.md).

BlogposterCMS tries to be secure first, developer friendly second, and user friendly third. If you spot a hole or have a question, open an issue—or a pull request if you’re feeling brave. Have fun!

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to propose changes.

## License

MIT. Use at your own risk, see [`LICENSE`](LICENSE) for the thrilling legal text.
All source files begin with an MIT license header.
