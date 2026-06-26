# Workboard

This workboard is the lightweight planning surface for BlogposterCMS. It is not
a replacement for GitHub Issues or a GitHub Project board. It gives maintainers
and contributors a stable, versioned place to understand the current direction,
break larger ideas into reviewable work, and keep architecture boundaries clear.

Open-source projects commonly use a mix of:

- GitHub Issues for specific bugs, tasks and discussions.
- Milestones for release-focused grouping.
- GitHub Projects for live Kanban-style tracking.
- A roadmap or workboard document for high-level direction and contribution
  context.

BlogposterCMS can use this file as the repo-owned source of intent, then mirror
individual cards into Issues or Projects when work becomes active.

## Board Rules

- Keep cards small enough to review, test and document.
- Do not merge broad redesigns into narrow fixes.
- Check whether an existing module, widget, app or importer already solves the
  need before adding a new surface.
- Every implementation card should name expected tests and documentation.
- User-facing or security-relevant work should update `CHANGELOG.md`.
- Architecture cards must state the ownership boundary they protect.

## Status Columns

- **Inbox** - captured ideas that still need shaping.
- **Ready** - scoped work with a clear acceptance path.
- **In Progress** - actively being implemented.
- **Review** - code or docs exist and need review, validation or polish.
- **Done** - completed and verified.
- **Later** - useful, but not important for the current direction.

## Card Template

```markdown
### Short title

- Status:
- Type: bug | feature | docs | security | architecture | migration
- Owner:
- Area:
- Context:
- Acceptance:
- Tests:
- Docs:
- Risks:
```

## Current Lanes

### Theme Contract And Styling Boundary

Theme packages should stay presentation-only. Styling belongs to themes;
features belong to widgets, modules or apps.

#### Theme contract documentation

- Status: Done
- Type: architecture, docs
- Area: themes, module boundaries
- Context: Document the rule that themes provide CSS, tokens and static
  presentation assets, while widgets/modules/apps own behavior and data.
- Acceptance: Theme responsibility is documented and linked from the docs index
  and Theme Manager reference.
- Tests: Not required for docs-only work.
- Docs: `docs/theme_contract.md`, `docs/modules/themeManager.md`
- Risks: If the rule stays documentation-only forever, imports may still create
  theme packages with too much responsibility.

#### Theme manifest validation policy

- Status: Review
- Type: architecture, security
- Area: `themeManager`, `htmlTheme` importer
- Context: `theme.json` is strict metadata and cannot declare capabilities,
  JavaScript assets or hidden runtime behavior.
- Acceptance: Allowed fields are explicit, unsupported fields produce clear
  diagnostics, invalid manifests are unavailable, and imported themes cannot
  declare module/app/widget behavior.
- Tests: Theme Manager boundary tests and HTML theme importer tests.
- Docs: Theme Contract and Theme Manager reference.
- Risks: Too strict too early may break existing imported themes; too loose may
  invite feature/theme overlap.

#### `theme.js` compatibility policy

- Status: Review
- Type: architecture
- Area: public themes
- Context: Blogposter is a fresh platform and does not need legacy theme
  JavaScript compatibility.
- Acceptance: Theme imports do not generate `theme.js`, Theme Manager does not
  expose JS theme assets, and `/themes` does not serve executable assets.
- Tests: Runtime theme loading and Theme Manager metadata tests.
- Docs: Theme Contract.
- Risks: Existing manually copied experimental themes may need behavior moved
  into widgets, modules or apps.

### WordPress And Site Migration

Whole-site imports should split rendered output, content, media and behavior
instead of stuffing everything into a theme.

#### WordPress site package manifest

- Status: Review
- Type: architecture, migration
- Area: importers, WordPress migration
- Context: Define a package format for a WordPress-side exporter that can
  include rendered pages, global styles, content records, media, menus, SEO and
  mapping reports.
- Acceptance: Manifest fields are documented, responsibilities are split
  between theme assets, content import, media import and widget/module mapping,
  and unsafe executable theme behavior is excluded by default.
- Tests: `tests/themeImporter.test.js`
- Docs: Importer module reference.
- Risks: If the package format is too vague, Elementor/Divi/Gutenberg imports
  become hard to debug.

#### Blogposter site package importer

- Status: Review
- Type: feature, migration
- Area: `mother/modules/importer`
- Context: Add `wordpressSitePackage` beside `wordpress` and `htmlTheme` for
  full WordPress-exporter packages.
- Acceptance: Dry-run first, then import media and rendered page fallbacks
  through existing events, report page scripts as blocked behavior, and block
  packages that try to put scripts into the theme layer.
- Tests: Importer unit tests for dry-run, blocked theme scripts, media events
  and rendered page fallback events.
- Docs: Importer module reference and migration guide.
- Risks: WXR/page duplicate handling and richer widget mapping still need
  dedicated follow-up work.

#### WordPress-side exporter prototype

- Status: Inbox
- Type: feature, migration
- Area: external WordPress exporter
- Context: Build a WordPress-side exporter that exports rendered HTML/CSS/JS, database
  content, media, menus, SEO metadata and builder-specific data.
- Acceptance: Export package can be generated from a local WordPress site and
  inspected without importing.
- Tests: Fixture WordPress sites for Gutenberg, Elementor and classic themes.
- Docs: Exporter setup guide.
- Risks: WordPress builders vary widely; the exporter must prefer honest fallback
  reports over fake perfect conversion.

#### Import confidence report

- Status: Inbox
- Type: feature, migration
- Area: importers, admin UX
- Context: Imported pages should report what was mapped natively, what was kept
  as sanitized HTML fallback, and what was skipped.
- Acceptance: Dry-run output includes per-page confidence, warnings and
  recommended follow-up work.
- Tests: Import plan tests with known unsupported blocks.
- Docs: Migration troubleshooting guide.
- Risks: Without clear reports, users may trust a migration that silently lost
  behavior.

### Platform Core

Blogposter should grow by extending existing module contracts, not by creating a
second product or bypassing the event-driven architecture.

#### Platform Core v1 scope

- Status: Ready
- Type: architecture, feature
- Area: core modules, identity, permissions, audit, validation
- Context: Blogposter can stay a small CMS for normal users while exposing
  deeper platform capabilities for power users. The first platform slice should
  harden the shared business foundation before ERP-like modules are added.
- Acceptance: Define the first implementation goal as Organization/Tenant Core
  with memberships and active organization context, permission enforcement,
  stable error codes, an audit hook foundation, tests, docs and changelog
  updates. Do not introduce a broad new UI; reuse existing Admin, Users and
  Settings surfaces only where a visible touchpoint is necessary.
- Tests: Organization core event tests, membership permission-denial tests,
  active-organization context tests, and regression coverage for stable error
  codes.
- Docs: Architecture, module overview, User Management reference and this
  workboard.
- Risks: If ERP-style domain modules start before this foundation exists,
  tenant boundaries, permissions and debugging behavior will become
  inconsistent across modules.

#### Organization/Tenant Core

- Status: Ready
- Type: feature, architecture
- Area: new `organizationManager` core module, `userManagement`
- Context: Users and roles already exist, but organizations, memberships and
  active organization context are a separate platform responsibility. Keep this
  out of generic user CRUD so future products, portals and ERP modules can share
  the same tenant boundary.
- Acceptance: Add an `organizationManager` core module with organization CRUD,
  membership management and active-organization context events such as
  `createOrganization`, `listOrganizations`, `addOrganizationMember`,
  `updateOrganizationMemberRole`, `removeOrganizationMember` and
  `setActiveOrganization`. All events must validate payloads, enforce
  permissions, return stable error codes and persist only through
  `databaseManager`.
- Tests: Core event tests for create/list/update/archive flows, membership
  edge cases, duplicate membership handling, permission failures and invalid
  active organization selection.
- Docs: New module reference plus updates to architecture, modules and
  user-management boundaries.
- Risks: Mixing tenant state directly into legacy roles could make later
  organization-scoped permissions difficult to reason about.

#### Dashboard project switcher

- Status: Later
- Type: feature, architecture
- Area: dashboard shell, `organizationManager`
- Context: The dashboard header now shows the current `SITE_TITLE` beside the
  public-site globe. A real dropdown should wait until Organization/Tenant Core
  owns multiple projects, memberships and active organization context.
- Acceptance: Replace the static project label with an accessible dropdown that
  lists available organizations/projects, persists the active context through
  `organizationManager`, and keeps the public-site link behavior explicit.
- Tests: Header data-helper tests, active-organization event tests, permission
  denial coverage and dashboard navigation regression tests.
- Docs: Dashboard guide plus the Organization/Tenant Core module reference.
- Risks: Shipping a fake switcher before tenant context exists would imply
  isolation that the backend cannot enforce yet.

#### Policy and permission scope

- Status: Ready
- Type: architecture, security
- Area: `userManagement`, permission catalog, runtime contracts
- Context: The current permission catalog is useful, but platform modules need a
  clear policy layer that can distinguish global permissions, organization
  permissions and module-specific capabilities without exposing all complexity
  to simple users.
- Acceptance: Reuse the existing role and permission catalog, add documented
  policy helpers for scoped checks, seed simple presets for normal users and
  power users, and keep server-side enforcement as the source of truth.
- Tests: Permission helper tests for global, organization and wildcard cases;
  regression tests proving denied users cannot bypass scoped checks through
  runtime/admin facades.
- Docs: Permission groups, User Management and architecture boundaries.
- Risks: Adding UI toggles before the policy model is stable could make the
  normal admin experience feel heavier without improving enforcement.

#### Audit Core foundation

- Status: Inbox
- Type: feature, architecture
- Area: new `auditManager` core module, runtime contracts
- Context: Content revisions exist for editorial history, but business flows
  need a shared audit stream for who did what, when and through which module.
- Acceptance: Add a backend-only `auditManager` with `recordAuditEvent` and
  `listAuditEvents`, sanitized metadata, actor/module/resource fields and
  permission-gated reads. Other core modules can write audit events through a
  stable contract without owning audit storage directly.
- Tests: Audit write/list tests, metadata sanitization tests and permission
  denial coverage.
- Docs: New module reference and architecture update.
- Risks: If audit logging is added ad hoc inside each feature, later reporting
  and retention rules will be hard to make consistent.

#### Shared error and validation contract

- Status: Ready
- Type: architecture
- Area: core utilities, event bus, admin/runtime facades
- Context: Platform modules need searchable, stable error codes and safe
  messages so failures can be debugged quickly without leaking internals.
- Acceptance: Introduce a shared error shape with `code`, `message`, `status`
  and optional sanitized `details`, plus validation helpers for common payload
  checks. New Platform Core events must use codes such as `ORG_NOT_FOUND`,
  `ORG_MEMBER_EXISTS`, `ORG_PERMISSION_DENIED`,
  `VALIDATION_REQUIRED_FIELD` and `POLICY_DENIED`.
- Tests: Error helper tests, facade normalization tests and at least one module
  integration path that preserves the code to the UI/data helper layer.
- Docs: Developer quickstart and architecture notes for module authors.
- Risks: Retrofitting every old free-form error at once would be too broad; the
  first pass should establish the contract and use it in new platform work.

#### Background jobs and business modules

- Status: Later
- Type: architecture, feature
- Area: jobs, integrations, future ERP modules
- Context: Background jobs, integrations, products, orders, inventory and
  finance modules become safer once tenant, policy, audit and error contracts
  are in place.
- Acceptance: Do not start ERP-domain modules until Platform Core v1 has a
  stable boundary. When this lane becomes active, add jobs and integration
  contracts before carrier, payment, product or order modules.
- Tests: To be defined with the first job manager or domain module.
- Docs: Workboard and future module references.
- Risks: Business modules built too early may duplicate YiTaiCOS behavior
  without the safety boundaries that make ERP flows maintainable.

#### Public capability map

- Status: Inbox
- Type: architecture, docs
- Area: modules, permissions, runtime contracts
- Context: Document which core modules own identity, permissions, media,
  content, workflow, SEO, search, themes and imports.
- Acceptance: Contributors can tell where a feature belongs before coding.
- Tests: Not required for docs-only work.
- Docs: Architecture and module overview.
- Risks: Without this map, new features may duplicate existing modules.

#### Contributor workflow board sync

- Status: Inbox
- Type: process, docs
- Area: open-source maintenance
- Context: Decide how cards from this workboard become GitHub Issues,
  milestones or GitHub Project items.
- Acceptance: `CONTRIBUTING.md` explains how to propose work and how maintainers
  promote cards into active tasks.
- Tests: Not required for docs-only work.
- Docs: `CONTRIBUTING.md`
- Risks: If process stays unclear, contributors may open broad PRs that are hard
  to review.
