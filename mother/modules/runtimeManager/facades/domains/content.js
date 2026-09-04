'use strict';

const { BACKEND_EVENTS } = require('../../../../contracts/generatedBackendEventCatalog');

// Content-domain facade declarations stay together so new content operations do
// not expand Runtime Manager's orchestration entrypoint.
const adminActions = Object.freeze({
  content: Object.freeze({
    list: { eventName: BACKEND_EVENTS.LIST_CONTENT_ENTRIES, moduleName: 'contentEngine', permission: 'content.update' },
    get: { eventName: BACKEND_EVENTS.GET_CONTENT_ENTRY, moduleName: 'contentEngine', permission: 'content.update' },
    create: { eventName: BACKEND_EVENTS.CREATE_CONTENT_ENTRY, moduleName: 'contentEngine', permission: 'content.create' },
    update: { eventName: BACKEND_EVENTS.UPDATE_CONTENT_ENTRY, moduleName: 'contentEngine', permission: 'content.update' },
    publish: { eventName: BACKEND_EVENTS.PUBLISH_CONTENT_ENTRY, moduleName: 'contentEngine', permission: 'content.publish' },
    trash: { eventName: BACKEND_EVENTS.TRASH_CONTENT_ENTRY, moduleName: 'contentEngine', permission: 'content.delete' },
    restore: { eventName: BACKEND_EVENTS.RESTORE_CONTENT_ENTRY, moduleName: 'contentEngine', permission: 'content.restore' },
    revisions: { eventName: BACKEND_EVENTS.GET_CONTENT_REVISIONS, moduleName: 'contentEngine', permission: 'content.update' },
    revision: { eventName: BACKEND_EVENTS.GET_CONTENT_REVISION, moduleName: 'contentEngine', permission: 'content.update' },
    restoreRevision: { eventName: BACKEND_EVENTS.RESTORE_CONTENT_REVISION, moduleName: 'contentEngine', permission: 'content.update' },
    scheduled: { eventName: BACKEND_EVENTS.LIST_SCHEDULED_CONTENT_ENTRIES, moduleName: 'contentEngine', permission: 'content.publish' },
    trashed: { eventName: BACKEND_EVENTS.LIST_TRASHED_CONTENT_ENTRIES, moduleName: 'contentEngine', permission: 'content.delete' }
  }),
  contentTypes: Object.freeze({
    list: { eventName: BACKEND_EVENTS.LIST_CONTENT_TYPES, moduleName: 'contentEngine', permission: 'content.update' },
    get: { eventName: BACKEND_EVENTS.GET_CONTENT_TYPE, moduleName: 'contentEngine', permission: 'content.update' },
    upsert: { eventName: BACKEND_EVENTS.REGISTER_CONTENT_TYPE, moduleName: 'contentEngine', permission: 'content.types.manage' }
  }),
  media: Object.freeze({
    list: { eventName: BACKEND_EVENTS.LIST_MEDIA_ATTACHMENTS, moduleName: 'mediaManager', permission: 'media.manage' },
    get: { eventName: BACKEND_EVENTS.GET_MEDIA_ATTACHMENT, moduleName: 'mediaManager', permission: 'media.manage' },
    create: { eventName: BACKEND_EVENTS.CREATE_MEDIA_ATTACHMENT, moduleName: 'mediaManager', permission: 'media.manage' },
    update: { eventName: BACKEND_EVENTS.UPDATE_MEDIA_ATTACHMENT, moduleName: 'mediaManager', permission: 'media.manage' },
    delete: { eventName: BACKEND_EVENTS.DELETE_MEDIA_ATTACHMENT, moduleName: 'mediaManager', permission: 'media.manage' },
    upsertVariant: { eventName: BACKEND_EVENTS.UPSERT_MEDIA_VARIANT, moduleName: 'mediaManager', permission: 'media.manage' },
    listVariants: { eventName: BACKEND_EVENTS.LIST_MEDIA_VARIANTS, moduleName: 'mediaManager', permission: 'media.manage' },
    deleteVariant: { eventName: BACKEND_EVENTS.DELETE_MEDIA_VARIANT, moduleName: 'mediaManager', permission: 'media.manage' },
    link: { eventName: BACKEND_EVENTS.LINK_MEDIA_TO_CONTENT, moduleName: 'mediaManager', permission: 'media.manage' },
    unlink: { eventName: BACKEND_EVENTS.UNLINK_MEDIA_FROM_CONTENT, moduleName: 'mediaManager', permission: 'media.manage' },
    listForContent: { eventName: BACKEND_EVENTS.LIST_MEDIA_FOR_CONTENT, moduleName: 'mediaManager', permission: 'media.manage' },
    listContent: { eventName: BACKEND_EVENTS.LIST_CONTENT_FOR_MEDIA, moduleName: 'mediaManager', permission: 'media.manage' },
    listLocalFolder: { eventName: BACKEND_EVENTS.LIST_LOCAL_FOLDER, moduleName: 'mediaManager', permission: 'media.manage' },
    createLocalFolder: { eventName: BACKEND_EVENTS.CREATE_LOCAL_FOLDER, moduleName: 'mediaManager', permission: 'media.manage' },
    uploadToFolder: { eventName: BACKEND_EVENTS.UPLOAD_FILE_TO_FOLDER, moduleName: 'mediaManager', permission: 'media.manage' },
    deleteLocalItem: { eventName: BACKEND_EVENTS.DELETE_LOCAL_ITEM, moduleName: 'mediaManager', permission: 'media.manage' },
    renameLocalItem: { eventName: BACKEND_EVENTS.RENAME_LOCAL_ITEM, moduleName: 'mediaManager', permission: 'media.manage' },
    makeFilePublic: { eventName: BACKEND_EVENTS.MAKE_FILE_PUBLIC, moduleName: 'mediaManager', permission: 'media.manage' }
  }),
  workflow: Object.freeze({
    acquireLock: { eventName: BACKEND_EVENTS.ACQUIRE_CONTENT_LOCK, moduleName: 'workflowManager', permission: 'content.update' },
    refreshLock: { eventName: BACKEND_EVENTS.REFRESH_CONTENT_LOCK, moduleName: 'workflowManager', permission: 'content.update' },
    releaseLock: { eventName: BACKEND_EVENTS.RELEASE_CONTENT_LOCK, moduleName: 'workflowManager', permission: 'content.update' },
    getLock: { eventName: BACKEND_EVENTS.GET_CONTENT_LOCK, moduleName: 'workflowManager', permission: 'content.update' },
    saveAutosave: { eventName: BACKEND_EVENTS.SAVE_CONTENT_AUTOSAVE, moduleName: 'workflowManager', permission: 'content.update' },
    getAutosave: { eventName: BACKEND_EVENTS.GET_CONTENT_AUTOSAVE, moduleName: 'workflowManager', permission: 'content.update' },
    listAutosaves: { eventName: BACKEND_EVENTS.LIST_CONTENT_AUTOSAVES, moduleName: 'workflowManager', permission: 'content.update' },
    deleteAutosave: { eventName: BACKEND_EVENTS.DELETE_CONTENT_AUTOSAVE, moduleName: 'workflowManager', permission: 'content.update' },
    submitReview: { eventName: BACKEND_EVENTS.SUBMIT_CONTENT_REVIEW, moduleName: 'workflowManager', permission: 'content.update' },
    approveReview: { eventName: BACKEND_EVENTS.APPROVE_CONTENT_REVIEW, moduleName: 'workflowManager', permission: 'content.publish' },
    rejectReview: { eventName: BACKEND_EVENTS.REJECT_CONTENT_REVIEW, moduleName: 'workflowManager', permission: 'content.publish' },
    getReview: { eventName: BACKEND_EVENTS.GET_CONTENT_REVIEW, moduleName: 'workflowManager', permission: 'content.publish' },
    reviewQueue: { eventName: BACKEND_EVENTS.LIST_CONTENT_REVIEW_QUEUE, moduleName: 'workflowManager', permission: 'content.publish' }
  }),
  comments: Object.freeze({
    create: { eventName: BACKEND_EVENTS.CREATE_COMMENT, moduleName: 'commentsManager', permission: 'comments.create' },
    get: { eventName: BACKEND_EVENTS.GET_COMMENT, moduleName: 'commentsManager', permission: 'comments.moderate' },
    listForEntry: { eventName: BACKEND_EVENTS.LIST_COMMENTS_FOR_ENTRY, moduleName: 'commentsManager', permission: 'comments.moderate' },
    update: { eventName: BACKEND_EVENTS.UPDATE_COMMENT, moduleName: 'commentsManager', permission: 'comments.edit' },
    updateStatus: { eventName: BACKEND_EVENTS.UPDATE_COMMENT_STATUS, moduleName: 'commentsManager', permission: 'comments.moderate' },
    delete: { eventName: BACKEND_EVENTS.DELETE_COMMENT, moduleName: 'commentsManager', permission: 'comments.delete' }
  }),
  metadata: Object.freeze({
    registerField: { eventName: BACKEND_EVENTS.REGISTER_META_FIELD, moduleName: 'metadataManager', permission: 'metadata.manage' },
    getField: { eventName: BACKEND_EVENTS.GET_META_FIELD, moduleName: 'metadataManager', permission: 'metadata.manage' },
    listFields: { eventName: BACKEND_EVENTS.LIST_META_FIELDS, moduleName: 'metadataManager', permission: 'metadata.manage' },
    deleteField: { eventName: BACKEND_EVENTS.DELETE_META_FIELD, moduleName: 'metadataManager', permission: 'metadata.manage' },
    set: { eventName: BACKEND_EVENTS.SET_METADATA, moduleName: 'metadataManager', permission: 'metadata.manage' },
    get: { eventName: BACKEND_EVENTS.GET_METADATA, moduleName: 'metadataManager', permission: 'metadata.manage' },
    getValue: { eventName: BACKEND_EVENTS.GET_METADATA_VALUE, moduleName: 'metadataManager', permission: 'metadata.manage' },
    delete: { eventName: BACKEND_EVENTS.DELETE_METADATA, moduleName: 'metadataManager', permission: 'metadata.manage' },
    deleteForTarget: { eventName: BACKEND_EVENTS.DELETE_METADATA_FOR_TARGET, moduleName: 'metadataManager', permission: 'metadata.manage' }
  }),
  search: Object.freeze({
    index: { eventName: BACKEND_EVENTS.INDEX_SEARCH_DOCUMENT, moduleName: 'searchManager', permission: 'search.manage' },
    get: { eventName: BACKEND_EVENTS.GET_SEARCH_DOCUMENT, moduleName: 'searchManager', permission: 'search.manage' },
    remove: { eventName: BACKEND_EVENTS.REMOVE_SEARCH_DOCUMENT, moduleName: 'searchManager', permission: 'search.manage' },
    query: { eventName: BACKEND_EVENTS.SEARCH_DOCUMENTS, moduleName: 'searchManager', permission: 'search.manage' },
    reindexContent: { eventName: BACKEND_EVENTS.REINDEX_CONTENT_ENTRIES, moduleName: 'searchManager', permission: 'search.manage' }
  }),
  importers: Object.freeze({
    list: { eventName: BACKEND_EVENTS.LIST_IMPORTERS, moduleName: 'importer', permission: 'importers.list' },
    run: { eventName: BACKEND_EVENTS.RUN_IMPORT, moduleName: 'importer', permission: 'importers.run' }
  }),
  exporters: Object.freeze({
    list: { eventName: BACKEND_EVENTS.LIST_EXPORTERS, moduleName: 'exportManager', permission: 'exporters.list' },
    run: { eventName: BACKEND_EVENTS.RUN_EXPORT, moduleName: 'exportManager', permission: 'exporters.run' }
  }),
  preview: Object.freeze({
    token: { eventName: BACKEND_EVENTS.CREATE_CONTENT_PREVIEW_TOKEN, moduleName: 'runtimeManager', permission: 'content.update' }
  })
});

const appContextReadActions = Object.freeze({
  content: new Set(['list', 'get', 'revisions', 'revision', 'scheduled', 'trashed']),
  contentTypes: new Set(['list', 'get']),
  media: new Set(['list', 'get', 'listVariants', 'listForContent', 'listContent'])
});

module.exports = Object.freeze({
  name: 'content',
  adminActions,
  publicActions: Object.freeze({}),
  appContextReadActions
});
