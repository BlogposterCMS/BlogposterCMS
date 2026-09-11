# Localized content and Designer layouts

Configure available content languages under **General Settings → Content languages**.
Article, Page Editor and Studio select those locales from a dropdown, including
regional codes such as `zh-CN` or `de-CH`. The existing Settings authority stores
one validated `WEBSITE_CONTENT_LANGUAGES` document. An installation without it uses
`DEFAULT_LANGUAGE`, then `en`. Existing pages/designs keep their original main
language and translations; changing the site catalog does not relabel content.
The locale does not change the admin UI language or commerce market, prices,
taxes or access rights. Save or discard a draft before changing locale.

## Documents

The page-list brush opens an article in the shared document modal. Its title is
editable inline; the explicit SEO title wins when set, otherwise the page title
feeds the browser/SEO title. The gear opens page settings. Existing imported HTML
opens in its source editor so custom markup, CSS and media are not converted.

The header language icon changes the document locale. A missing translation
shows main-language blocks and title in gray, without creating a saved
translation on open. Editing a block makes it authored in the active language.
The selected untranslated block offers **Use source block**, which accepts an
unchanged image or text for this locale; it is not a second document-language
switch. Toolbar actions follow the current schema, selection and history:
unavailable actions are disabled, including Undo/Redo with no history, media
description without selected media and link creation without selected text.
Translated HTML remains in the existing Pages translation row. Only progress
(translated/removed block IDs and title status) is stored in
`meta.articleTranslations[locale]`. Other translations and attachments are kept.
Existing translations without progress metadata remain complete authored copies.
Untranslated blocks pick up updated source content when the editor is reopened;
the public stored translation changes only when that editor is saved.

The Studio icon saves pending document edits before opening a page-owned design
with a content host. Returning to document mode requires the displayed warning:
the page stops using that design, but the saved design stays in the library.
The editor asset is loaded before detaching the page association. Returning to
Studio from this modal reattaches the same design. This association is shared
across languages; changing content language alone never changes it.

## Designer

One versioned Designer record owns the base layout, widget instances and
`layout.localizations = { version: 1, primaryLanguage, variants }`. The default
main language for an older design is `en`. Variants store sparse JSON deltas,
not duplicate designs. Stable container/widget/rule IDs preserve inheritance
when the base gains a new container or responsive viewport rule.

The existing layout and widget controls edit the selected locale. Content,
spacing, placement and responsive rules can differ by language. Desktop,
tablet and mobile keep the same native viewport contract: a mobile-only edit
overrides that rule in that language, while unchanged desktop rules inherit.
Widget-level legacy translations are inherited first; an explicit Designer
locale edit wins. Regional locales inherit their base language, then their own
overrides. The public first response and subsequent widget reads use that same
resolved locale and do not send the entire override catalog.

Gray widgets indicate source content in a secondary locale. **Use inherited
design for this language** resets that saved locale after confirmation through
the normal versioned save. It does not delete the base design or other locales.
Explicit shape/content replacements may replace an array without stable IDs;
authors should keep stable IDs when editing reusable structured content.

The sandbox uses the existing AppLoader bridge to update only the current shell
URL's language. It receives no parent DOM, storage, token or navigation authority.
Reload keeps the selected language. All content writes still use the existing
Pages/Designer permissions, sanitizers and version checks.

## Agent parity

Article snapshots expose `contentLanguage`, `sourceLanguage`, `availableLanguages`,
toolbar availability, `translationExists`
and each stable block's `translationStatus`. Actions include
`article.openLanguage`, `article.useSourceBlock`, `article.setTitle`, block edits,
save and Studio handoff. Imported HTML exposes `content.openLanguage`,
`content.edit`, `content.save` and `content.openDesign` as a lossless source unit.

Studio snapshots expose `state.localization` and `state.documentEditor` beside
the existing layout tree, widgets, responsive placement and link feedback.
`locale.open` switches the active editing context; normal element/layout actions
then edit that locale. `locale.reset` requires confirmation. Revision checks,
draft review and acknowledgement-before-navigation apply on the same AgentManager
surface, including document modals opened inside Studio.
Language-opening commands validate against the same configured choices. The
current/source locale and existing Designer or article-progress variants remain
editable for compatibility. Settings use the existing form edit/save agent actions.
