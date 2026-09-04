'use strict';

const { BACKEND_EVENTS } = require('../../../../contracts/generatedBackendEventCatalog');

// Identity and authorization actions share one domain boundary even though the
// existing backing event owner remains userManagement or auth.
const adminActions = Object.freeze({
  auth: Object.freeze({
    loginStrategies: { eventName: BACKEND_EVENTS.LIST_LOGIN_STRATEGIES, moduleName: 'auth', permission: 'auth.strategies.view' },
    setStrategyEnabled: { eventName: BACKEND_EVENTS.SET_LOGIN_STRATEGY_ENABLED, moduleName: 'auth', permission: 'auth.strategies.manage' }
  }),
  users: Object.freeze({
    list: { eventName: BACKEND_EVENTS.GET_ALL_USERS, moduleName: 'userManagement', permission: 'users.read' },
    me: { eventName: BACKEND_EVENTS.GET_USER_DETAILS_BY_ID, moduleName: 'userManagement', permission: 'users.read', useActorUserId: true },
    get: { eventName: BACKEND_EVENTS.GET_USER_DETAILS_BY_ID, moduleName: 'userManagement', permission: 'users.read' },
    getByUsername: { eventName: BACKEND_EVENTS.GET_USER_DETAILS_BY_USERNAME, moduleName: 'userManagement', permission: 'users.read' },
    count: { eventName: BACKEND_EVENTS.GET_USER_COUNT, moduleName: 'userManagement', permission: 'users.read' },
    create: { eventName: BACKEND_EVENTS.CREATE_USER, moduleName: 'userManagement', permission: 'users.create' },
    update: { eventName: BACKEND_EVENTS.UPDATE_USER_PROFILE, moduleName: 'userManagement', permission: 'users.update' },
    delete: { eventName: BACKEND_EVENTS.DELETE_USER, moduleName: 'userManagement', permission: 'users.delete' },
    access: { eventName: BACKEND_EVENTS.GET_USER_ACCESS, moduleName: 'userManagement', permission: 'userManagement.editUser' },
    setAccess: { eventName: BACKEND_EVENTS.SET_USER_ACCESS, moduleName: 'userManagement', permission: 'userManagement.editUser' }
  }),
  roles: Object.freeze({
    list: { eventName: BACKEND_EVENTS.GET_ALL_ROLES, moduleName: 'userManagement', permission: 'userManagement.listRoles' },
    create: { eventName: BACKEND_EVENTS.CREATE_ROLE, moduleName: 'userManagement', permission: 'userManagement.createRole' },
    update: { eventName: BACKEND_EVENTS.UPDATE_ROLE, moduleName: 'userManagement', permission: 'userManagement.editRole' },
    delete: { eventName: BACKEND_EVENTS.DELETE_ROLE, moduleName: 'userManagement', permission: 'userManagement.deleteRole' },
    assign: { eventName: BACKEND_EVENTS.ASSIGN_ROLE_TO_USER, moduleName: 'userManagement', permission: 'userManagement.editRole' },
    remove: { eventName: BACKEND_EVENTS.REMOVE_ROLE_FROM_USER, moduleName: 'userManagement', permission: 'userManagement.editRole' },
    forUser: { eventName: BACKEND_EVENTS.GET_ROLES_FOR_USER, moduleName: 'userManagement', permission: 'userManagement.listRoles' },
    incrementToken: { eventName: BACKEND_EVENTS.INCREMENT_USER_TOKEN_VERSION, moduleName: 'userManagement', permission: 'userManagement.editUser' }
  }),
  permissions: Object.freeze({
    list: { eventName: BACKEND_EVENTS.GET_ALL_PERMISSIONS, moduleName: 'userManagement', permission: 'userManagement.managePermissions' },
    create: { eventName: BACKEND_EVENTS.CREATE_PERMISSION, moduleName: 'userManagement', permission: 'userManagement.managePermissions' }
  })
});

const publicActions = Object.freeze({
  users: Object.freeze({
    count: { eventName: BACKEND_EVENTS.GET_USER_COUNT, moduleName: 'userManagement' },
    register: { eventName: BACKEND_EVENTS.PUBLIC_REGISTER, moduleName: 'userManagement' }
  }),
  auth: Object.freeze({
    activeLoginStrategies: { eventName: BACKEND_EVENTS.LIST_ACTIVE_LOGIN_STRATEGIES, moduleName: 'auth' }
  })
});

module.exports = Object.freeze({
  name: 'access',
  adminActions,
  publicActions,
  appContextReadActions: Object.freeze({})
});
