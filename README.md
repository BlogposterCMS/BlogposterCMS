
# BlogposterCMS 🚀  
*A modular CMS built exactly how you want it.*

**Version:** 0.1 – Developer Preview  
**Release Date:** April 24, 2025  

---

## TL;DR

**BlogposterCMS** is a lightweight, Node.js-powered content management system focused on a simple philosophy:  
**Everything is modular. Keep the core small.** No heavy frameworks, no rigid rules—just clean, modular code, event-driven architecture, and your imagination.

---

## Key Features ⚡

| Feature                 | Quick Overview                                                                |
|-------------------------|-------------------------------------------------------------------------------|
| **Mother Core**         | The heart of the system (`mother/`) manages global middleware, authentication, and event-driven communication. |
| **True Modularity**     | Build your features in `modules/<yourModule>`, plug them in via events—simple and effective. |
| **JWT-secured Events**  | Secure, signed JWT tokens ensure safe and decoupled communication between modules. |
| **Frontend Freedom**    | Default Alpine.js setup for client-side rendering, but you're free to integrate React, Vue, htmx, or even classic SSR. |
| **Easy Debugging**      | Clean separation of frontend and backend logic. Debug without wading through spaghetti code. |
| **Open MIT License**    | No lock-in. Fork, tweak, deploy, sell as SaaS—it's completely your choice. |

---

## Project Structure 📁

```
BlogposterCMS
├── app.js              # Application entry point
├── config/             # Runtime and security configurations
├── mother/             # Core functionalities: auth, middleware, events
│   ├── emitters/       # motherEmitter, notificationEmitter, uiEmitter...
│   └── modules/        # Core system modules (authentication, logging, etc.)
├── modules/            # Place your custom feature modules here
├── .env                # Environment variables (remember to keep this safe!)
├── package.json        # Dependencies and scripts
└── LICENSE             # MIT License
```

*Note: There's **no `ui/` directory yet**—the exciting frontend part comes soon! 🎁*

---

## Documentation & Wiki 📚 

All the juicy details—for module development, API endpoints, deployment, and more—live in our GitHub Wiki:

👉 [BlogposterCMS Wiki](https://github.com/BlogposterCMS/BlogposterCMS/wiki)

- **Getting Started**: full setup & configuration  
- **Core Concepts**: mother-core, events, dependency loader  
- **Module Development**: writing, packaging, and installing your own modules  
- **API Reference**: all `/admin/api/...` endpoints with payload samples  
- **Deployment**: Docker, Kubernetes, and server-less recipes  

Make sure to keep the wiki in sync with your code changes, so contributors always know where to look!

---

## Quick Start 🚦

Clone, install, and run:

```bash
git clone https://github.com/BlogposterCMS/BlogposterCMS.git
cd BlogposterCMS
npm install
npm start  # Runs on port 3000 by default
```

Visit `http://localhost:3000` and start assembling your first modules!

---

## Roadmap 🗺️

- [ ] Official Public API documentation
- [ ] Intelligent auto-update manager with differential patching
- [ ] Enhanced security defaults (CSP presets, built-in rate limiting)
- [ ] Microservice-ready architecture for enterprise deployments
- [ ] A powerful and intuitive visual UI editor (coming soon™)

*Changes land when they're ready—no unnecessary release cycles.*

---

## Contributing 🤝

We love contributions! Here’s how you can help:

1. Fork the repository → Create a feature branch → Submit a pull request.
2. Keep PRs focused: one feature per PR.
3. Include tests or update existing ones as appropriate.

And remember: If you break something dramatically, at least make the comment hilarious.

---

## License 📜

**MIT License** – Free to use, modify, and distribute. Just don't blame us if you deploy it on a potato.  

*Built with love, Node.js, and just the right amount of sarcasm by **Matteo**.*

---

## About the Creator 👨‍💻

Developed by **Matteo**, a software engineer passionate about clean, modular design and straightforward architecture. Enjoy the simplicity, embrace the power, and let your imagination fly!

---

## Support or Questions ❓

Have an issue or a cool idea? [Open a GitHub issue](https://github.com/BlogposterCMS/BlogposterCMS/issues) and let's chat!

---

## Spread the Word 📣

If you like BlogposterCMS, tell others about it or give us a star ⭐. Your support makes open-source better!

---

## Acknowledgments 🙏

A huge thank-you to the incredible open-source community and everyone making the web simpler and more accessible.

Special shout-out to **OpenAI and ChatGPT** for being a fantastic coding buddy and rubber duck. (I still wrote all the code myself, obviously—but shh 🤫.)

---

Happy coding! 🚀✨
