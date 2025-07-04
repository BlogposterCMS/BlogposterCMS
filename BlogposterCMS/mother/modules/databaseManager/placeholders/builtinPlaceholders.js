/**
 * mother/modules/databaseManager/placeholders/builtinPlaceholders.js
 *
 * The single list of all built-in placeholder strings, shared by Postgres and Mongo.
 */
module.exports = [
  // UserManagement
  'INIT_USER_MANAGEMENT',
  'INIT_B2B_FIELDS',
  'ADD_USER_FIELD',

  // settingsManager
  'INIT_SETTINGS_SCHEMA',
  'INIT_SETTINGS_TABLES',
  'CHECK_AND_ALTER_SETTINGS_TABLES',
  'GET_SETTING',
  'UPSERT_SETTING',
  'GET_ALL_SETTINGS',

  // pagesManager
  'INIT_PAGES_SCHEMA',
  'INIT_PAGES_TABLE',
  'CHECK_AND_ALTER_PAGES_TABLE',
  'CREATE_PAGE',
  'ADD_PARENT_CHILD_RELATION',
  'GET_ALL_PAGES',
  'GET_CHILD_PAGES',
  'GET_PAGE_BY_ID',
  'GET_PAGE_BY_SLUG',
  'GET_PAGES_BY_LANE',
  'UPDATE_PAGE',
  'DELETE_PAGE',
  'GET_START_PAGE',
  'SET_AS_START',
  'GENERATE_XML_SITEMAP',
  'SEARCH_PAGES',


  // ModuleLoader
  'DROP_MODULE_DATABASE',
  'INIT_MODULE_REGISTRY_TABLE',
  'CHECK_MODULE_REGISTRY_COLUMNS',
  'ALTER_MODULE_REGISTRY_COLUMNS',
  'SELECT_MODULE_REGISTRY',
  'LIST_ACTIVE_GRAPES_MODULES',

  // DependencyLoader
  'CHECK_DB_EXISTS_DEPENDENCYLOADER',
  'INIT_DEPENDENCYLOADER_SCHEMA',
  'INIT_DEPENDENCYLOADER_TABLE',
  'LIST_DEPENDENCYLOADER_DEPENDENCIES',

  // UnifiedSettings
  'LIST_MODULE_SETTINGS',

  // ServerManager
  'INIT_SERVERMANAGER_SCHEMA',
  'SERVERMANAGER_ADD_LOCATION',
  'SERVERMANAGER_GET_LOCATION',
  'SERVERMANAGER_LIST_LOCATIONS',
  'SERVERMANAGER_DELETE_LOCATION',
  'SERVERMANAGER_UPDATE_LOCATION',

  // MediaManager
  'INIT_MEDIA_SCHEMA',
  'MEDIA_ADD_FILE',
  'MEDIA_LIST_FILES',
  'MEDIA_DELETE_FILE',
  'MEDIA_UPDATE_FILE',

  // ShareManager
  'INIT_SHARED_LINKS_TABLE',
  'CREATE_SHARE_LINK',
  'REVOKE_SHARE_LINK',
  'GET_SHARE_LINK',

  // TranslationManager
  'INIT_TRANSLATION_TABLES',

  // WidgetManager
  /* public lane */
  'INIT_WIDGETS_TABLE_PUBLIC',
  'UPDATE_WIDGET_PUBLIC',
  'DELETE_WIDGET_PUBLIC',

  /*  admin lane */
  'INIT_WIDGETS_TABLE_ADMIN',
  'UPDATE_WIDGET_ADMIN',
  'DELETE_WIDGET_ADMIN',

  //plainSpace
  'INIT_PLAINSPACE_LAYOUTS',
  'INIT_PLAINSPACE_LAYOUT_TEMPLATES',
  'UPSERT_PLAINSPACE_LAYOUT_TEMPLATE',
  'GET_PLAINSPACE_LAYOUT_TEMPLATE',
  'GET_PLAINSPACE_LAYOUT_TEMPLATE_NAMES',
  'UPSERT_PLAINSPACE_LAYOUT',
  'GET_PLAINSPACE_LAYOUT',
  'GET_ALL_PLAINSPACE_LAYOUTS',
  'INIT_PLAINSPACE_WIDGET_INSTANCES',
  'UPSERT_WIDGET_INSTANCE',
  'GET_WIDGET_INSTANCE',
  'SET_GLOBAL_LAYOUT_TEMPLAT',
  'GET_GLOBAL_LAYOUT_TEMPLATE'

];
