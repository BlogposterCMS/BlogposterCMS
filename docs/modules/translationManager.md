# Translation Manager

Stores translated strings for content objects and manages the available
languages. It now uses dedicated database placeholders instead of generic table
CRUD, so SQLite, Postgres and Mongo share the same event contract.

## Startup
- Core module; creates translation text, language, usage and cache tables on initialization.

## Purpose
- Add, retrieve, list, update and delete translated text values.
- Manage supported languages and their active/text-direction metadata.
- Keep translation storage available through stable module events for the
  runtime/admin facade.

## Listened Events
- `createTranslatedText`
- `upsertTranslatedText`
- `getTranslatedText`
- `listTranslatedTexts`
- `updateTranslatedText`
- `deleteTranslatedText`
- `addLanguage`
- `upsertTranslationLanguage`
- `getTranslationLanguage`
- `listLanguages`
- `deleteTranslationLanguage`

Text events accept either `textId` or `objectId` + `fieldName` +
`languageCode`, depending on the action. Language codes are normalized to a
lowercase safe key. All events require a valid JWT and verify translation
permissions before touching the database.

## Boundaries

`translationManager` is a core storage module. Apps, widgets and community
modules should not write translation tables directly; they use the documented
translation events or higher-level runtime/admin facades.

All incoming references are normalized at the event boundary. `textId`,
`objectId`, field names, locale values and status values must be scalar strings;
object-shaped identifiers are rejected instead of being coerced to
`[object Object]`. List limits and offsets are clamped before database
placeholder execution.

Translation metadata is stored as bounded plain JSON. Unsupported values are
dropped, strings are capped, and unsafe object keys such as `__proto__`,
`constructor` and `prototype` are discarded before data reaches the database
placeholder layer.
