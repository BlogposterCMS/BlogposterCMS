# Dependency Loader

## Boundaries

Dependency Loader is a core-only broker for approved package access. Community
modules receive only the dependencies explicitly allowed for their own module
name, and requests for built-in Node modules, path-like names or another
module's dependency list are rejected. Apps and widgets do not use this module
directly; they rely on their owning app or widget contract.

Maintains a whitelist of allowed Node.js dependencies for community modules. This prevents arbitrary `require()` calls from untrusted code.

## Startup
- Loaded as a core module when the server starts.
- Loads allowed dependencies from its registry table.

## Purpose
- Provides the `requestDependency` event so modules can dynamically require approved packages.
- Dependency requesters must be registered modules; registered module type wins
  over the payload.
- Community modules may request dependencies only for their own module name and
  cannot spoof `moduleType: "core"`.
- Requester and target module names must be simple module identifiers.
- Built-in Node modules (`fs`, `child_process`, `node:*`) and path-like
  dependency names are rejected even if a payload tries to request them.

## Listened Events
- `requestDependency`

If a module asks for a package that is not whitelisted, the request is rejected
to maintain security. Community modules use the loader-owned contract; they do
not emit `requestDependency` through their scoped `moduleHost` event bus.
