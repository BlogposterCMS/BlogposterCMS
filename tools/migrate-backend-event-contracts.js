'use strict';

const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const generate = require('@babel/generator').default;
const t = require('@babel/types');

const ROOT = path.resolve(__dirname, '..');
const MOTHER_ROOT = path.join(ROOT, 'mother');
const GENERATED_CATALOG = path.join(MOTHER_ROOT, 'contracts', 'generatedBackendEventCatalog.js');
const GENERATED_CATALOG_TYPES = path.join(MOTHER_ROOT, 'contracts', 'generatedBackendEventCatalog.d.ts');
const GENERATED_SPECS = path.join(MOTHER_ROOT, 'contracts', 'generatedBackendEventContractSpecs.js');
const GENERATED_TYPES = path.join(MOTHER_ROOT, 'contracts', 'generatedBackendEventContracts.d.ts');
const GENERATED_FILES = new Set([
  GENERATED_CATALOG,
  GENERATED_CATALOG_TYPES,
  GENERATED_SPECS,
  GENERATED_TYPES
]);
const WRITE_MODE = process.argv.includes('--write');
const CHECK_MODE = process.argv.includes('--check') || !WRITE_MODE;
const REPORT_MODE = process.argv.includes('--report');
const SOURCE_EXTENSIONS = new Set(['.js', '.cjs', '.mjs', '.ts', '.tsx']);
const ERROR_CODES = Object.freeze({
  CATALOG_OUTDATED: 'BACKEND_EVENT_CONTRACT_CATALOG_OUTDATED',
  SCHEMAS_OUTDATED: 'BACKEND_EVENT_CONTRACT_SCHEMAS_OUTDATED',
  TYPES_OUTDATED: 'BACKEND_EVENT_CONTRACT_TYPES_OUTDATED',
  UNBOUNDED_SCHEMA: 'BACKEND_EVENT_CONTRACT_UNBOUNDED_SCHEMA',
  LEGACY_ADAPTER: 'BACKEND_EVENT_CONTRACT_LEGACY_ADAPTER',
  LEGACY_CALLBACK_CALL: 'BACKEND_EVENT_CONTRACT_LEGACY_CALLBACK_CALL',
  LEGACY_CALL: 'BACKEND_EVENT_CONTRACT_LEGACY_CALL',
  LEGACY_NAME: 'BACKEND_EVENT_CONTRACT_LEGACY_NAME',
  PARSE_FAILED: 'BACKEND_EVENT_CONTRACT_PARSE_FAILED'
});
const CALLBACK_TRANSPORT_FILES = new Set([
  'mother/contracts/eventContract.js',
  // Community modules use callbacks as their process-bridge wire protocol.
  // Its dispatch is a transport boundary, not a core motherEmitter caller.
  'mother/modules/moduleLoader/moduleHost.js'
]);
// These HTTP-facing contracts bootstrap the catalog before their generated
// constants exist. Every other event is discovered from backend call sites.
const CORE_CONTRACT_EVENTS = Object.freeze([
  'cmsAdminApiRequest',
  'cmsPublicRuntimeRequest',
  'dispatchAppEvent',
  'ensurePublicToken',
  'issuePublicToken'
]);
const RESULT_TYPE_DECLARATION_OVERRIDES = Object.freeze({
  cmsAdminApiRequest: '{ resource: string; action: string; eventName: string; data: JsonValue }',
  cmsPublicRuntimeRequest: '{ resource: string; action: string; eventName: string; data: JsonValue }',
  dispatchAppEvent: '{ ok: boolean; handled: boolean; appName: string; event: string; data: JsonValue }',
  ensurePublicToken: 'string',
  issuePublicToken: 'string'
});
const PAYLOAD_TYPE_DECLARATION_OVERRIDES = Object.freeze({
  cmsAdminApiRequest: [
    '  "jwt": string;',
    '  "moduleName": "runtimeManager";',
    '  "moduleType": "core";',
    '  "resource": string;',
    '  "action": string;',
    '  "params"?: JsonObject;',
    '  "decodedJWT"?: JsonObject;',
    '  "appContext"?: JsonObject;',
    '  "isExternalRequest"?: boolean;'
  ],
  cmsPublicRuntimeRequest: [
    '  "jwt": string;',
    '  "moduleName": "runtimeManager";',
    '  "moduleType": "core";',
    '  "resource": string;',
    '  "action": string;',
    '  "params"?: JsonObject;',
    '  "decodedJWT"?: JsonObject;',
    '  "appContext"?: JsonObject;',
    '  "isExternalRequest"?: boolean;'
  ],
  dispatchAppEvent: [
    '  "jwt": string;',
    '  "moduleName": "appLoader";',
    '  "moduleType": "core";',
    '  "appName": string;',
    '  "event"?: string;',
    '  "type"?: string;',
    '  "data"?: JsonObject;',
    '  "decodedJWT"?: JsonObject;',
    '  "isExternalRequest"?: boolean;'
  ],
  ensurePublicToken: [
    '  "moduleName": string;',
    '  "moduleType"?: "core";',
    '  "currentToken"?: string | null;',
    '  "purpose"?: string;',
    '  "isExternalRequest"?: boolean;'
  ],
  issuePublicToken: [
    '  "moduleName": string;',
    '  "moduleType"?: "core";',
    '  "purpose"?: string;',
    '  "isExternalRequest"?: boolean;'
  ]
});

function eventConstantName(eventName) {
  const normalized = String(eventName || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
  return /^[0-9]/.test(normalized) ? `EVENT_${normalized}` : normalized;
}

function readExistingEventNames() {
  if (!fs.existsSync(GENERATED_CATALOG)) return [];
  try {
    delete require.cache[require.resolve(GENERATED_CATALOG)];
    const generated = require(GENERATED_CATALOG);
    return Array.isArray(generated.BACKEND_EVENT_NAMES) ? generated.BACKEND_EVENT_NAMES : [];
  } catch {
    return [];
  }
}

const EXISTING_EVENT_NAMES = new Set(readExistingEventNames());
const EXISTING_EVENTS_BY_CONSTANT = new Map(
  [...EXISTING_EVENT_NAMES].map(eventName => [eventConstantName(eventName), eventName])
);

function walk(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(absolutePath));
    else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(absolutePath);
  }
  return files.sort();
}

function parseSource(source, filePath) {
  try {
    return parser.parse(source, {
      sourceType: 'unambiguous',
      plugins: ['jsx', 'typescript'],
      errorRecovery: false
    });
  } catch (error) {
    const relativePath = path.relative(ROOT, filePath);
    throw new Error(`${ERROR_CODES.PARSE_FAILED}: ${relativePath}: ${error.message}`);
  }
}

function visit(node, visitor, parent = null) {
  if (!node || typeof node !== 'object') return;
  visitor(node, parent);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc' || key === 'extra' || key === 'comments') continue;
    if (Array.isArray(value)) {
      for (const child of value) visit(child, visitor, node);
    } else if (value && typeof value.type === 'string') {
      visit(value, visitor, node);
    }
  }
}

function stringValue(node) {
  if (node?.type === 'StringLiteral') return node.value;
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
  return null;
}

function eventNameValue(node) {
  const literal = stringValue(node);
  if (literal) return literal;
  if (
    node?.type === 'MemberExpression' &&
    isIdentifier(node.object, 'BACKEND_EVENTS')
  ) {
    const constantName = node.computed ? stringValue(node.property) : node.property?.name;
    return EXISTING_EVENTS_BY_CONSTANT.get(constantName) || null;
  }
  return null;
}

function memberName(node) {
  if (node?.type !== 'MemberExpression' && node?.type !== 'OptionalMemberExpression') return null;
  if (!node.computed && node.property?.type === 'Identifier') return node.property.name;
  return stringValue(node.property);
}

function isIdentifier(node, name) {
  return node?.type === 'Identifier' && node.name === name;
}

function isEmitterExpression(node) {
  if (node?.type === 'Identifier') {
    return node.name === 'motherEmitter' || node.name === 'emitter';
  }
  return memberName(node) === 'motherEmitter';
}

function unwrapCallback(node) {
  if (
    node?.type === 'CallExpression' &&
    node.arguments.length === 1 &&
    ['once', 'onceCallback'].includes(node.callee?.name)
  ) {
    return node.arguments[0];
  }
  return node;
}

function calledIdentifier(node, name) {
  return node?.type === 'CallExpression' && isIdentifier(node.callee, name);
}

function completionStatement(statement, resolveName, rejectName) {
  if (statement.type === 'ReturnStatement' || statement.type === 'ExpressionStatement') {
    const expression = statement.type === 'ReturnStatement' ? statement.argument : statement.expression;
    if (calledIdentifier(expression, resolveName)) {
      return t.returnStatement(expression.arguments[0] ? t.cloneNode(expression.arguments[0], true) : null);
    }
    if (calledIdentifier(expression, rejectName)) {
      return t.throwStatement(
        expression.arguments[0]
          ? t.cloneNode(expression.arguments[0], true)
          : t.newExpression(t.identifier('Error'), [t.stringLiteral('Backend event rejected')])
      );
    }
  }
  if (statement.type === 'BlockStatement') {
    return t.blockStatement(statement.body.map(child => completionStatement(child, resolveName, rejectName)));
  }
  if (statement.type === 'IfStatement') {
    return t.ifStatement(
      t.cloneNode(statement.test, true),
      completionStatement(statement.consequent, resolveName, rejectName),
      statement.alternate ? completionStatement(statement.alternate, resolveName, rejectName) : null
    );
  }
  return t.cloneNode(statement, true);
}

function blockFunctionSource(parameter, statements, resolveName, rejectName, isAsync = false) {
  const rewritten = statements.map(statement => completionStatement(statement, resolveName, rejectName));
  const fn = t.arrowFunctionExpression(
    parameter ? [t.cloneNode(parameter, true)] : [],
    t.blockStatement(rewritten)
  );
  fn.async = isAsync;
  return generate(fn, { compact: false, comments: true }).code;
}

function testUsesError(node, errorName) {
  return isIdentifier(node, errorName);
}

function callbackHandlers(callback, resolveName, rejectName) {
  const unwrapped = unwrapCallback(callback);
  if (!['ArrowFunctionExpression', 'FunctionExpression'].includes(unwrapped?.type)) return null;
  const errorParam = unwrapped.params[0];
  const resultParam = unwrapped.params[1] || null;
  const errorName = errorParam?.type === 'Identifier' ? errorParam.name : null;
  if (!errorName) {
    if (unwrapped.body.type !== 'BlockStatement') return null;
    const handler = blockFunctionSource(null, unwrapped.body.body, resolveName, rejectName, unwrapped.async === true);
    return { success: handler, failure: handler };
  }

  if (unwrapped.body.type === 'ConditionalExpression' && testUsesError(unwrapped.body.test, errorName)) {
    const successStatement = t.expressionStatement(t.cloneNode(unwrapped.body.alternate, true));
    const errorStatement = t.expressionStatement(t.cloneNode(unwrapped.body.consequent, true));
    return {
      success: blockFunctionSource(resultParam, [successStatement], resolveName, rejectName, unwrapped.async === true),
      failure: blockFunctionSource(errorParam, [errorStatement], resolveName, rejectName, unwrapped.async === true)
    };
  }

  if (unwrapped.body.type !== 'BlockStatement') return null;
  const statements = unwrapped.body.body;
  const guardIndex = statements.findIndex(statement => (
    statement.type === 'IfStatement' && testUsesError(statement.test, errorName)
  ));
  if (guardIndex < 0) return null;
  const guard = statements[guardIndex];
  const errorStatements = guard.consequent.type === 'BlockStatement'
    ? guard.consequent.body
    : [guard.consequent];
  const successStatements = guard.alternate
    ? (guard.alternate.type === 'BlockStatement' ? guard.alternate.body : [guard.alternate])
    : [...statements.slice(0, guardIndex), ...statements.slice(guardIndex + 1)];
  let errorLeaksIntoSuccess = false;
  for (const statement of successStatements) {
    visit(statement, child => {
      if (isIdentifier(child, errorName)) errorLeaksIntoSuccess = true;
    });
  }
  if (errorLeaksIntoSuccess) return null;
  return {
    success: blockFunctionSource(resultParam, successStatements, resolveName, rejectName, unwrapped.async === true),
    failure: blockFunctionSource(errorParam, errorStatements, resolveName, rejectName, unwrapped.async === true)
  };
}

function callbackOutcome(callback, resolveName, rejectName) {
  const unwrapped = unwrapCallback(callback);
  if (!['ArrowFunctionExpression', 'FunctionExpression'].includes(unwrapped?.type)) return null;
  const errorName = unwrapped.params[0]?.name;
  const resultName = unwrapped.params[1]?.name;
  if (!errorName) return null;

  let rejectCall = null;
  let resolveCall = null;
  const body = unwrapped.body;
  if (body.type === 'ConditionalExpression') {
    rejectCall = body.consequent;
    resolveCall = body.alternate;
  } else if (body.type === 'BlockStatement' && body.body.length === 2) {
    const [guard, resolution] = body.body;
    if (guard.type !== 'IfStatement' || guard.alternate) return null;
    const consequent = guard.consequent.type === 'BlockStatement'
      ? guard.consequent.body[0]
      : guard.consequent;
    rejectCall = consequent?.type === 'ReturnStatement' ? consequent.argument : consequent?.expression;
    resolveCall = resolution.type === 'ReturnStatement' ? resolution.argument : resolution.expression;
  } else {
    return null;
  }

  if (!calledIdentifier(rejectCall, rejectName) || !calledIdentifier(resolveCall, resolveName)) return null;
  if (!isIdentifier(rejectCall.arguments[0], errorName)) return null;
  return {
    callback: unwrapped,
    resultName,
    resolveValue: resolveCall.arguments[0] || null
  };
}

function canonicalPromiseMigration(node, source) {
  const executor = node.arguments[0];
  if (!['ArrowFunctionExpression', 'FunctionExpression'].includes(executor?.type)) return null;
  const resolveName = executor.params[0]?.name;
  const rejectName = executor.params[1]?.name;
  if (!resolveName || !rejectName || executor.body?.type !== 'BlockStatement' || executor.body.body.length !== 1) {
    return null;
  }

  const statement = executor.body.body[0];
  if (statement.type !== 'ExpressionStatement' || statement.expression.type !== 'CallExpression') return null;
  const emitCall = statement.expression;
  if (
    memberName(emitCall.callee) !== 'emit' ||
    !isEmitterExpression(emitCall.callee.object) ||
    emitCall.arguments.length !== 3
  ) {
    return null;
  }

  const outcome = callbackOutcome(emitCall.arguments[2], resolveName, rejectName);
  if (!outcome) return null;
  const emitterSource = source.slice(emitCall.callee.object.start, emitCall.callee.object.end);
  const eventSource = source.slice(emitCall.arguments[0].start, emitCall.arguments[0].end);
  const payloadSource = source.slice(emitCall.arguments[1].start, emitCall.arguments[1].end);
  const requestSource = `requestBackendEvent(${emitterSource}, ${eventSource}, ${payloadSource})`;
  if (
    !outcome.resolveValue ||
    (outcome.resultName && isIdentifier(outcome.resolveValue, outcome.resultName))
  ) {
    return requestSource;
  }
  if (!outcome.resultName) return null;
  const resultSource = source.slice(outcome.resolveValue.start, outcome.resolveValue.end);
  return `${requestSource}.then(${outcome.resultName} => ${resultSource})`;
}

function directCallbackMigration(node, source) {
  const callback = unwrapCallback(node.arguments[2]);
  if (!['ArrowFunctionExpression', 'FunctionExpression', 'Identifier', 'MemberExpression'].includes(callback?.type)) {
    return null;
  }
  const emitterSource = source.slice(node.callee.object.start, node.callee.object.end);
  const eventSource = source.slice(node.arguments[0].start, node.arguments[0].end);
  const payloadSource = source.slice(node.arguments[1].start, node.arguments[1].end);
  const callbackSource = source.slice(callback.start, callback.end);
  const requestSource = `requestBackendEvent(${emitterSource}, ${eventSource}, ${payloadSource})`;
  if (callback.type === 'Identifier' || callback.type === 'MemberExpression') {
    return `${requestSource}.then(result => ${callbackSource}(null, result), error => ${callbackSource}(error))`;
  }
  return `((eventCallback) => ${requestSource}.then(` +
    'result => eventCallback(null, result), error => eventCallback(error)' +
    `))(${callbackSource})`;
}

function migratedCallbackAdapter(node, source) {
  if (node?.type !== 'CallExpression' || node.arguments.length !== 1) return null;
  const wrapper = unwrapExpression(node.callee);
  if (
    wrapper?.type !== 'ArrowFunctionExpression' ||
    wrapper.params.length !== 1 ||
    wrapper.params[0]?.type !== 'Identifier'
  ) return null;
  const eventCallbackName = wrapper.params[0].name;
  const chain = unwrapExpression(wrapper.body);
  if (chain?.type !== 'CallExpression' || memberName(chain.callee) !== 'then') return null;
  const request = chain.callee.object;
  if (!isIdentifier(request?.callee, 'requestBackendEvent') || chain.arguments.length !== 2) return null;

  let forwardsCallback = false;
  for (const handler of chain.arguments) {
    visit(handler, child => {
      if (child.type === 'CallExpression' && isIdentifier(child.callee, eventCallbackName)) {
        forwardsCallback = true;
      }
    });
  }
  if (!forwardsCallback) return null;

  const callback = unwrapCallback(node.arguments[0]);
  if (!['ArrowFunctionExpression', 'FunctionExpression'].includes(callback?.type)) return null;
  const handlers = callbackHandlers(callback, '__eventResolve', '__eventReject');
  if (!handlers) return null;
  const requestSource = source.slice(request.start, request.end);
  return `${requestSource}.then(${handlers.success}, ${handlers.failure})`;
}

function structuredPromiseMigration(node) {
  const executor = node.arguments[0];
  if (!['ArrowFunctionExpression', 'FunctionExpression'].includes(executor?.type)) return null;
  const resolveName = executor.params[0]?.name;
  const rejectName = executor.params[1]?.name;
  if (!resolveName || !rejectName || executor.body?.type !== 'BlockStatement') return null;

  const statements = executor.body.body;
  const emitIndex = statements.findIndex(statement => (
    statement.type === 'ExpressionStatement' &&
    statement.expression.type === 'CallExpression' &&
    memberName(statement.expression.callee) === 'emit' &&
    isEmitterExpression(statement.expression.callee.object) &&
    statement.expression.arguments.length === 3
  ));
  if (emitIndex < 0 || emitIndex !== statements.length - 1) return null;
  const prelude = statements.slice(0, emitIndex);
  let preludeUsesCompletion = false;
  for (const statement of prelude) {
    visit(statement, child => {
      if (
        child.type === 'CallExpression' &&
        (isIdentifier(child.callee, resolveName) || isIdentifier(child.callee, rejectName))
      ) {
        preludeUsesCompletion = true;
      }
    });
  }
  if (preludeUsesCompletion) return null;

  const emitCall = statements[emitIndex].expression;
  const handlers = callbackHandlers(emitCall.arguments[2], resolveName, rejectName);
  if (!handlers) return null;
  let leakedCompletionCall = false;
  for (const handlerSource of [handlers.success, handlers.failure]) {
    visit(parser.parseExpression(handlerSource), child => {
      if (
        child.type === 'CallExpression' &&
        (isIdentifier(child.callee, resolveName) || isIdentifier(child.callee, rejectName))
      ) {
        leakedCompletionCall = true;
      }
    });
  }
  // Complex nested callback chains need an explicit sequential rewrite. Do
  // not emit a migration that leaves the removed Promise closures in scope.
  if (leakedCompletionCall) return null;
  const requestCall = t.callExpression(t.identifier('requestBackendEvent'), [
    t.cloneNode(emitCall.callee.object, true),
    t.cloneNode(emitCall.arguments[0], true),
    t.cloneNode(emitCall.arguments[1], true)
  ]);
  const chained = t.callExpression(
    t.memberExpression(requestCall, t.identifier('then')),
    [parser.parseExpression(handlers.success), parser.parseExpression(handlers.failure)]
  );
  if (!prelude.length) return generate(chained, { comments: true }).code;
  const wrapper = t.callExpression(
    t.parenthesizedExpression(t.arrowFunctionExpression([], t.blockStatement([
      ...prelude.map(statement => t.cloneNode(statement, true)),
      t.returnStatement(chained)
    ]))),
    []
  );
  return generate(wrapper, { comments: true }).code;
}

function lineNumber(source, offset) {
  return source.slice(0, offset).split(/\r?\n/).length;
}

function propertyName(node) {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  return stringValue(node);
}

function unwrapExpression(node) {
  let current = node;
  while (['TSAsExpression', 'TSTypeAssertion', 'TypeCastExpression', 'ParenthesizedExpression'].includes(current?.type)) {
    current = current.expression;
  }
  return current;
}

function expressionSchemaKinds(node) {
  const value = unwrapExpression(node);
  if (!value) return new Set(['undefined']);
  if (['ArrowFunctionExpression', 'FunctionExpression', 'ObjectMethod'].includes(value.type)) return new Set(['function']);
  if (value.type === 'Identifier' && value.name === 'undefined') return new Set(['undefined']);
  if (value.type === 'UnaryExpression' && value.operator === 'void') return new Set(['undefined']);
  // Domain values often use a literal placeholder at one caller and a richer
  // value at another dynamic facade. Keep their transport type JSON-safe;
  // explicit public contracts below the generator retain narrower types.
  return new Set(['json']);
}

function recordPayloadUsage(facts, eventName, payloadNode) {
  if (eventName && payloadNode) facts.payloadUsages.push({ eventName, payloadNode });
}

function recordListenerUsage(facts, eventName, handlerNode) {
  if (eventName && handlerNode) facts.listenerUsages.push({ eventName, handlerNode });
}

function collectFileFacts(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const ast = parseSource(source, filePath);
  const facts = {
    filePath,
    source,
    eventNames: new Set(),
    legacyAdapters: [],
    legacyCalls: [],
    legacyPromiseAdapters: [],
    legacyCallbackAdapters: [],
    promiseMigrations: [],
    legacyEventNames: [],
    eventConstantMigrations: [],
    directCallbackEmits: [],
    directCallbackMigrations: [],
    requestCalls: [],
    payloadUsages: [],
    listenerUsages: [],
    dynamicPayloadEventNames: new Set(),
    unboundedSchemas: [],
    edits: []
  };

  visit(ast, (node, parent) => {
    const literalEventName = stringValue(node);
    const isStaticPropertyKey = (
      ['ObjectProperty', 'ObjectMethod', 'ClassProperty', 'ClassMethod'].includes(parent?.type) &&
      parent.key === node &&
      parent.computed !== true
    );
    if (literalEventName && EXISTING_EVENT_NAMES.has(literalEventName)) {
      facts.legacyEventNames.push(node);
      facts.eventConstantMigrations.push(node);
      facts.edits.push({
        start: node.start,
        end: node.end,
        text: isStaticPropertyKey
          ? `[BACKEND_EVENTS.${eventConstantName(literalEventName)}]`
          : `BACKEND_EVENTS.${eventConstantName(literalEventName)}`
      });
    }

    if (node.type === 'FunctionDeclaration' && isIdentifier(node.id, 'emitAsync')) {
      facts.legacyAdapters.push(node);
      facts.edits.push({ start: node.start, end: node.end, text: '' });
      return;
    }

    if (node.type === 'CallExpression') {
      const callbackAdapterReplacement = migratedCallbackAdapter(node, source);
      if (callbackAdapterReplacement) {
        facts.legacyCallbackAdapters.push(node);
        facts.edits.push({
          start: node.start,
          end: node.end,
          text: callbackAdapterReplacement
        });
      }
    }

    if (
      node.type === 'NewExpression' &&
      isIdentifier(node.callee, 'Promise') &&
      relative(filePath) !== 'mother/contracts/eventContract.js'
    ) {
      let wrapsBackendEmit = false;
      visit(node, child => {
        if (
          child.type === 'CallExpression' &&
          memberName(child.callee) === 'emit' &&
          isEmitterExpression(child.callee.object)
        ) {
          wrapsBackendEmit = true;
        }
      });
      if (wrapsBackendEmit) {
        facts.legacyPromiseAdapters.push(node);
        const replacement = canonicalPromiseMigration(node, source);
        const structuredReplacement = replacement || structuredPromiseMigration(node);
        if (structuredReplacement) {
          facts.promiseMigrations.push(node);
          facts.edits.push({ start: node.start, end: node.end, text: structuredReplacement });
        }
      }
    }

    if (node.type === 'CallExpression') {
      const callName = memberName(node.callee);
      if (
        ['on', 'once', 'emit', 'request', 'listenerCount', 'removeListener', 'off', 'prependListener'].includes(callName) &&
        isEmitterExpression(node.callee.object)
      ) {
        const eventName = eventNameValue(node.arguments[0]);
        if (eventName) facts.eventNames.add(eventName);
        if (eventName && ['emit', 'request'].includes(callName)) {
          recordPayloadUsage(facts, eventName, node.arguments[1]);
        }
        if (eventName && ['on', 'once', 'prependListener'].includes(callName)) {
          recordListenerUsage(facts, eventName, node.arguments[1]);
        }
        if (stringValue(node.arguments[0])) {
          facts.legacyEventNames.push(node.arguments[0]);
          facts.eventConstantMigrations.push(node.arguments[0]);
          facts.edits.push({
            start: node.arguments[0].start,
            end: node.arguments[0].end,
            text: `BACKEND_EVENTS.${eventConstantName(eventName)}`
          });
        }
      }

      if (callName === 'request' && isEmitterExpression(node.callee.object)) {
        facts.requestCalls.push(node);
        const emitterSource = source.slice(node.callee.object.start, node.callee.object.end);
        const argumentSource = node.arguments
          .map(argument => source.slice(argument.start, argument.end))
          .join(', ');
        facts.edits.push({
          start: node.start,
          end: node.end,
          text: `requestBackendEvent(${emitterSource}, ${argumentSource})`
        });
      }

      if (isIdentifier(node.callee, 'emitAsync')) {
        facts.legacyCalls.push(node);
        const eventName = stringValue(node.arguments[1]);
        if (eventName) facts.eventNames.add(eventName);
        if (node.arguments.length >= 3) {
          const emitterSource = source.slice(node.arguments[0].start, node.arguments[0].end);
          const eventSource = source.slice(node.arguments[1].start, node.arguments[1].end);
          const payloadSource = source.slice(node.arguments[2].start, node.arguments[2].end);
          facts.edits.push({
            start: node.start,
            end: node.end,
            text: `requestBackendEvent(${emitterSource}, ${eventSource}, ${payloadSource})`
          });
        }
      }

      if (memberName(node.callee) === 'emitAsync') {
        facts.legacyCalls.push(node);
      }

      if (isIdentifier(node.callee, 'requestBackendEvent')) {
        const eventName = eventNameValue(node.arguments[1]);
        if (eventName) facts.eventNames.add(eventName);
        recordPayloadUsage(facts, eventName, node.arguments[2]);
        if (stringValue(node.arguments[1])) {
          facts.legacyEventNames.push(node.arguments[1]);
          facts.eventConstantMigrations.push(node.arguments[1]);
          facts.edits.push({
            start: node.arguments[1].start,
            end: node.arguments[1].end,
            text: `BACKEND_EVENTS.${eventConstantName(eventName)}`
          });
        }
      }

      if (
        callName === 'emit' &&
        isEmitterExpression(node.callee.object) &&
        node.arguments.length === 3 &&
        relative(filePath) !== 'mother/contracts/eventContract.js'
      ) {
        facts.directCallbackEmits.push(node);
        if (!CALLBACK_TRANSPORT_FILES.has(relative(filePath))) {
          const replacement = directCallbackMigration(node, source);
          if (replacement) {
            facts.directCallbackMigrations.push(node);
            facts.edits.push({ start: node.start, end: node.end, text: replacement });
          }
        }
      }
    }

    if (
      (node.type === 'ObjectProperty' || node.type === 'Property') &&
      eventNameValue(node.value) &&
      ((isIdentifier(node.key, 'eventName')) || stringValue(node.key) === 'eventName') &&
      (
        relative(filePath).startsWith('mother/modules/runtimeManager/facades/') ||
        relative(filePath) === 'mother/modules/appLoader/index.js'
      )
    ) {
      facts.eventNames.add(eventNameValue(node.value));
      // Facades select the event from a definition and build its payload from
      // runtime params. The individual call is intentionally dynamic, so the
      // generated schema must validate additional values instead of claiming
      // a statically closed object.
      facts.dynamicPayloadEventNames.add(eventNameValue(node.value));
    }

    // Service modules historically exported their private adapter. Removing
    // the now-unused shorthand keeps that compatibility layer from surviving.
    if (
      (node.type === 'ObjectProperty' || node.type === 'Property') &&
      node.shorthand === true &&
      isIdentifier(node.key, 'emitAsync') &&
      parent?.type === 'ObjectExpression'
    ) {
      let end = node.end;
      while (end < source.length && /\s/.test(source[end])) end += 1;
      if (source[end] === ',') end += 1;
      facts.edits.push({ start: node.start, end, text: '' });
    }
  });

  // A previous migration version used this temporary callback-forwarding
  // wrapper. Keep it in the audit so old checkouts cannot retain that layer.
  const knownCallbackAdapterStarts = new Set(facts.legacyCallbackAdapters.map(node => node.start));
  for (const match of source.matchAll(/\(\(eventCallback\)\s*=>\s*requestBackendEvent/g)) {
    if (!knownCallbackAdapterStarts.has(match.index)) {
      facts.legacyCallbackAdapters.push({ start: match.index, end: match.index });
    }
  }
  for (const match of source.matchAll(/\btype\s*:\s*['"]any['"]/g)) {
    facts.unboundedSchemas.push({ start: match.index, end: match.index + match[0].length });
  }

  if (
    (
      facts.requestCalls.length ||
      facts.legacyCalls.length ||
      facts.promiseMigrations.length ||
      facts.directCallbackMigrations.length
    ) &&
    !source.includes('requestBackendEvent')
  ) {
    const target = path.join(MOTHER_ROOT, 'contracts', 'backendEventContracts');
    let requestPath = path.relative(path.dirname(filePath), target).replace(/\\/g, '/');
    if (!requestPath.startsWith('.')) requestPath = `./${requestPath}`;
    const directiveEnd = ast.program.directives?.length
      ? ast.program.directives[ast.program.directives.length - 1].end
      : 0;
    facts.edits.push({
      start: directiveEnd,
      end: directiveEnd,
      text: `\n\nconst { requestBackendEvent } = require('${requestPath}');\n\n`
    });
  }

  if (facts.eventConstantMigrations.length && !source.includes('generatedBackendEventCatalog')) {
    const target = path.join(MOTHER_ROOT, 'contracts', 'generatedBackendEventCatalog');
    let catalogPath = path.relative(path.dirname(filePath), target).replace(/\\/g, '/');
    if (!catalogPath.startsWith('.')) catalogPath = `./${catalogPath}`;
    const directiveEnd = ast.program.directives?.length
      ? ast.program.directives[ast.program.directives.length - 1].end
      : 0;
    const isTypeScript = ['.ts', '.tsx'].includes(path.extname(filePath));
    facts.edits.push({
      start: directiveEnd,
      end: directiveEnd,
      text: isTypeScript
        ? `\n\nimport { BACKEND_EVENTS } from '${catalogPath}';\n\n`
        : `\n\nconst { BACKEND_EVENTS } = require('${catalogPath}');\n\n`
    });
  }

  return facts;
}

function applyEdits(source, edits) {
  const ordered = [...edits].sort((left, right) => right.start - left.start);
  let output = source;
  let lastStart = source.length + 1;
  for (const edit of ordered) {
    if (edit.end > lastStart) continue;
    output = `${output.slice(0, edit.start)}${edit.text}${output.slice(edit.end)}`;
    lastStart = edit.start;
  }
  return output.replace(/\n{3,}/g, '\n\n');
}

function catalogSource(eventNames) {
  const sortedNames = [...eventNames].sort((left, right) => left.localeCompare(right));
  const constantOwners = new Map();
  for (const eventName of sortedNames) {
    const constantName = eventConstantName(eventName);
    const owner = constantOwners.get(constantName);
    if (owner && owner !== eventName) {
      throw new Error(`BACKEND_EVENT_CONTRACT_CONSTANT_COLLISION: ${owner} and ${eventName} map to ${constantName}.`);
    }
    constantOwners.set(constantName, eventName);
  }
  const entries = sortedNames
    .map(eventName => `  ${eventConstantName(eventName)}: ${JSON.stringify(eventName)}`)
    .join(',\n');
  return `'use strict';\n\n// Generated by tools/migrate-backend-event-contracts.js. Do not edit by hand.\nconst BACKEND_EVENTS = Object.freeze({\n${entries}\n});\nconst BACKEND_EVENT_NAMES = Object.freeze(Object.values(BACKEND_EVENTS));\n\nmodule.exports = { BACKEND_EVENTS, BACKEND_EVENT_NAMES };\n`;
}

function catalogTypesSource(eventNames) {
  const sortedNames = [...eventNames].sort((left, right) => left.localeCompare(right));
  const entries = sortedNames
    .map(eventName => `  readonly ${eventConstantName(eventName)}: ${JSON.stringify(eventName)};`)
    .join('\n');
  const union = sortedNames.map(JSON.stringify).join(' | ');
  return `// Generated by tools/migrate-backend-event-contracts.js. Do not edit by hand.\nexport declare const BACKEND_EVENTS: {\n${entries}\n};\nexport declare const BACKEND_EVENT_NAMES: readonly (${union})[];\n`;
}

const COMMON_PAYLOAD_FIELDS = Object.freeze({
  authModuleSecret: ['string'],
  decodedJWT: ['object', 'null'],
  isExternalRequest: ['boolean'],
  jwt: ['string', 'null'],
  moduleName: ['string'],
  moduleType: ['string', 'null'],
  skipJWT: ['boolean']
});

function addKinds(fieldKinds, fieldName, kinds) {
  if (!fieldName) return;
  const target = fieldKinds.get(fieldName) || new Set();
  for (const kind of kinds) target.add(kind);
  fieldKinds.set(fieldName, target);
}

function inspectPayloadObject(payloadNode, fieldKinds) {
  const payload = unwrapExpression(payloadNode);
  if (payload?.type !== 'ObjectExpression') return { dynamic: true, required: null };
  const required = new Set();
  let dynamic = false;
  for (const property of payload.properties) {
    if (property.type === 'SpreadElement') {
      dynamic = true;
      continue;
    }
    const name = propertyName(property.key);
    if (!name || property.computed) {
      dynamic = true;
      continue;
    }
    required.add(name);
    addKinds(fieldKinds, name, expressionSchemaKinds(property.value || property));
  }
  return { dynamic, required };
}

function inspectCallableLocalUsage(root, localFields, fieldKinds) {
  // Listener code often destructures a callback before validating or invoking it.
  // Preserve that evidence so the generated boundary accepts a real function.
  const markCallable = identifier => {
    if (identifier?.type !== 'Identifier') return;
    const fieldName = localFields.get(identifier.name);
    if (fieldName) addKinds(fieldKinds, fieldName, new Set(['function']));
  };
  visit(root, node => {
    if (node.type === 'CallExpression') {
      markCallable(node.callee);
      return;
    }
    if (node.type !== 'BinaryExpression') return;
    if (
      node.left?.type === 'UnaryExpression' &&
      node.left.operator === 'typeof' &&
      stringValue(node.right) === 'function'
    ) {
      markCallable(node.left.argument);
    }
    if (
      node.right?.type === 'UnaryExpression' &&
      node.right.operator === 'typeof' &&
      stringValue(node.left) === 'function'
    ) {
      markCallable(node.right.argument);
    }
  });
}

function isPayloadSource(node, payloadName) {
  // Treat defensive fallbacks such as `payload || {}` as the same payload source.
  const value = unwrapExpression(node);
  if (isIdentifier(value, payloadName)) return true;
  if (value?.type === 'LogicalExpression') {
    return isPayloadSource(value.left, payloadName);
  }
  return false;
}

function inspectListenerPayload(handlerNode, fieldKinds) {
  const handler = unwrapCallback(handlerNode);
  if (!['ArrowFunctionExpression', 'FunctionExpression'].includes(handler?.type)) return true;
  const payloadParam = handler.params[0];
  if (!payloadParam) return false;

  const localFields = new Map();
  const recordPattern = pattern => {
    let hasRest = false;
    for (const property of pattern.properties) {
      if (property.type === 'RestElement') {
        hasRest = true;
        continue;
      }
      const fieldName = propertyName(property.key);
      const value = property.value?.type === 'AssignmentPattern'
        ? property.value.left
        : property.value;
      if (fieldName && value?.type === 'Identifier') {
        localFields.set(value.name, fieldName);
      }
      addKinds(fieldKinds, fieldName, new Set(['json']));
    }
    return hasRest;
  };

  if (payloadParam.type === 'ObjectPattern') {
    const dynamic = recordPattern(payloadParam);
    inspectCallableLocalUsage(handler.body, localFields, fieldKinds);
    return dynamic;
  }
  if (payloadParam.type !== 'Identifier') return true;

  const payloadName = payloadParam.name;
  let dynamic = false;
  visit(handler.body, (node, parent) => {
    if (
      (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') &&
      isIdentifier(node.object, payloadName)
    ) {
      const name = memberName(node);
      if (!name) {
        dynamic = true;
        return;
      }
      const calledDirectly = parent?.type === 'CallExpression' && parent.callee === node;
      addKinds(fieldKinds, name, new Set([calledDirectly ? 'function' : 'json']));
    }
    if (
      node.type === 'VariableDeclarator' &&
      node.id?.type === 'ObjectPattern' &&
      isPayloadSource(node.init, payloadName)
    ) {
      dynamic = recordPattern(node.id) || dynamic;
    }
  });
  inspectCallableLocalUsage(handler.body, localFields, fieldKinds);
  return dynamic;
}

function schemaForKinds(kinds) {
  const normalized = new Set(kinds);
  if (normalized.has('function')) {
    return { type: 'function' };
  }
  if (normalized.has('json')) {
    for (const kind of ['string', 'integer', 'number', 'boolean', 'null', 'array', 'object']) {
      normalized.delete(kind);
    }
  }
  if (normalized.has('number')) normalized.delete('integer');
  const schemas = [...normalized]
    .sort()
    .map(type => type === 'string' ? { type, minLength: 1 } : { type });
  return schemas.length === 1 ? schemas[0] : { anyOf: schemas };
}

function resultTypeName(eventName) {
  return `${eventConstantName(eventName)
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map(part => `${part[0].toUpperCase()}${part.slice(1)}`)
    .join('')}Result`;
}

function payloadTypeName(eventName) {
  return resultTypeName(eventName).replace(/Result$/, 'Payload');
}

function buildContractSpecs(eventNames, facts) {
  const specs = new Map();
  for (const eventName of eventNames) {
    const fieldKinds = new Map(
      Object.entries(COMMON_PAYLOAD_FIELDS).map(([name, kinds]) => [name, new Set(kinds)])
    );
    const payloadUsages = facts.flatMap(fileFacts => (
      fileFacts.payloadUsages.filter(usage => usage.eventName === eventName)
    ));
    const listenerUsages = facts.flatMap(fileFacts => (
      fileFacts.listenerUsages.filter(usage => usage.eventName === eventName)
    ));
    let dynamic = payloadUsages.length === 0 || facts.some(fileFacts => (
      fileFacts.dynamicPayloadEventNames.has(eventName)
    ));
    for (const usage of payloadUsages) {
      const inspected = inspectPayloadObject(usage.payloadNode, fieldKinds);
      dynamic = dynamic || inspected.dynamic;
    }
    for (const usage of listenerUsages) {
      dynamic = inspectListenerPayload(usage.handlerNode, fieldKinds) || dynamic;
    }

    // Authentication and routing metadata is owned by MotherEmitter. Keep
    // those types strict even when a handler accesses them through a generic
    // identifier that static analysis can only classify as JSON.
    for (const [name, kinds] of Object.entries(COMMON_PAYLOAD_FIELDS)) {
      fieldKinds.set(name, new Set(kinds));
    }

    const required = new Set(['moduleName']);
    const properties = {};
    for (const name of [...fieldKinds.keys()].sort()) {
      properties[name] = schemaForKinds(fieldKinds.get(name));
    }
    specs.set(eventName, {
      description: `Generated internal backend contract for ${eventName}.`,
      payloadSchema: {
        type: 'object',
        required: [...required].sort(),
        properties,
        additionalProperties: dynamic
          ? { anyOf: [{ type: 'json' }, { type: 'function' }] }
          : false
      },
      resultSchema: { anyOf: [{ type: 'json' }, { type: 'undefined' }] },
      resultType: resultTypeName(eventName)
    });
  }
  return specs;
}

function specsSource(specs) {
  const serialized = JSON.stringify(Object.fromEntries([...specs].sort()), null, 2);
  return `'use strict';\n\n// Generated by tools/migrate-backend-event-contracts.js. Do not edit by hand.\nfunction deepFreeze(value) {\n  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;\n  for (const child of Object.values(value)) deepFreeze(child);\n  return Object.freeze(value);\n}\n\nconst GENERATED_BACKEND_EVENT_CONTRACT_SPECS = deepFreeze(${serialized});\n\nmodule.exports = { GENERATED_BACKEND_EVENT_CONTRACT_SPECS };\n`;
}

function typeForSchema(schema) {
  if (Array.isArray(schema?.anyOf)) {
    return [...new Set(schema.anyOf.map(typeForSchema))].join(' | ');
  }
  return ({
    array: 'JsonValue[]',
    boolean: 'boolean',
    function: 'BackendEventCallback',
    integer: 'number',
    json: 'JsonValue',
    null: 'null',
    number: 'number',
    object: 'JsonObject',
    string: 'string',
    undefined: 'undefined'
  })[schema?.type] || 'never';
}

function typesSource(specs) {
  const lines = [
    '// Generated by tools/migrate-backend-event-contracts.js. Do not edit by hand.',
    'export type JsonPrimitive = string | number | boolean | null;',
    'export type JsonObject = { readonly [key: string]: JsonValue };',
    'export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];',
    'export type BackendEventCallback = (...args: unknown[]) => unknown;',
    'export type BackendPayloadValue = JsonValue | BackendEventCallback | undefined;',
    ''
  ];
  for (const [eventName, spec] of [...specs].sort()) {
    const payloadType = payloadTypeName(eventName);
    lines.push(`export interface ${payloadType} {`);
    const payloadOverride = PAYLOAD_TYPE_DECLARATION_OVERRIDES[eventName];
    if (payloadOverride) {
      lines.push(...payloadOverride);
    } else {
      const required = new Set(spec.payloadSchema.required || []);
      for (const [fieldName, fieldSchema] of Object.entries(spec.payloadSchema.properties)) {
        lines.push(`  ${JSON.stringify(fieldName)}${required.has(fieldName) ? '' : '?'}: ${typeForSchema(fieldSchema)};`);
      }
      if (spec.payloadSchema.additionalProperties !== false) {
        lines.push('  readonly [key: string]: BackendPayloadValue;');
      }
    }
    lines.push('}');
    lines.push(
      `export type ${spec.resultType} = ${RESULT_TYPE_DECLARATION_OVERRIDES[eventName] || typeForSchema(spec.resultSchema)};`
    );
    lines.push('');
  }
  lines.push('export interface BackendEventContractMap {');
  for (const [eventName, spec] of [...specs].sort()) {
    lines.push(`  ${JSON.stringify(eventName)}: { payload: ${payloadTypeName(eventName)}; result: ${spec.resultType} };`);
  }
  lines.push('}');
  return `${lines.join('\n')}\n`;
}

function relative(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

function eventNamesFromFacts(facts) {
  const eventNames = new Set(CORE_CONTRACT_EVENTS);
  for (const fileFacts of facts) {
    for (const eventName of fileFacts.eventNames) eventNames.add(eventName);
  }
  return eventNames;
}

function legacyFailuresFromFacts(facts) {
  const failures = [];
  for (const fileFacts of facts) {
    for (const node of [
      ...fileFacts.legacyAdapters,
      ...fileFacts.legacyPromiseAdapters,
      ...fileFacts.legacyCallbackAdapters
    ]) {
      failures.push(`${ERROR_CODES.LEGACY_ADAPTER}: ${relative(fileFacts.filePath)}:${lineNumber(fileFacts.source, node.start)}`);
    }
    for (const node of fileFacts.legacyCalls) {
      failures.push(`${ERROR_CODES.LEGACY_CALL}: ${relative(fileFacts.filePath)}:${lineNumber(fileFacts.source, node.start)}`);
    }
    for (const node of fileFacts.legacyEventNames) {
      failures.push(`${ERROR_CODES.LEGACY_NAME}: ${relative(fileFacts.filePath)}:${lineNumber(fileFacts.source, node.start)}`);
    }
    for (const node of fileFacts.unboundedSchemas) {
      failures.push(`${ERROR_CODES.UNBOUNDED_SCHEMA}: ${relative(fileFacts.filePath)}:${lineNumber(fileFacts.source, node.start)}`);
    }
    if (!CALLBACK_TRANSPORT_FILES.has(relative(fileFacts.filePath))) {
      for (const node of fileFacts.directCallbackEmits) {
        failures.push(`${ERROR_CODES.LEGACY_CALLBACK_CALL}: ${relative(fileFacts.filePath)}:${lineNumber(fileFacts.source, node.start)}`);
      }
    }
  }
  return failures;
}

function main() {
  const files = walk(MOTHER_ROOT).filter(filePath => !GENERATED_FILES.has(filePath));
  let facts = files.map(collectFileFacts);
  let eventNames = eventNamesFromFacts(facts);

  if (WRITE_MODE) {
    for (let pass = 1; pass <= 8; pass += 1) {
      for (const eventName of eventNames) {
        EXISTING_EVENT_NAMES.add(eventName);
        EXISTING_EVENTS_BY_CONSTANT.set(eventConstantName(eventName), eventName);
      }
      const editCount = facts.reduce((count, fileFacts) => count + fileFacts.edits.length, 0);
      for (const fileFacts of facts) {
        if (!fileFacts.edits.length) continue;
        fs.writeFileSync(fileFacts.filePath, applyEdits(fileFacts.source, fileFacts.edits));
      }
      fs.writeFileSync(GENERATED_CATALOG, catalogSource(eventNames));

      facts = files.map(collectFileFacts);
      eventNames = eventNamesFromFacts(facts);
      const remaining = legacyFailuresFromFacts(facts);
      if (!remaining.length) {
        const specs = buildContractSpecs(eventNames, facts);
        fs.writeFileSync(GENERATED_CATALOG, catalogSource(eventNames));
        fs.writeFileSync(GENERATED_CATALOG_TYPES, catalogTypesSource(eventNames));
        fs.writeFileSync(GENERATED_SPECS, specsSource(specs));
        fs.writeFileSync(GENERATED_TYPES, typesSource(specs));
        process.stdout.write(`Migrated backend request callers in ${pass} pass(es) and wrote ${eventNames.size} typed contract entries.\n`);
        return;
      }
      if (editCount === 0 || pass === 8) {
        process.stderr.write(`${remaining.join('\n')}\n`);
        process.exitCode = 1;
        return;
      }
    }
  }

  const failures = legacyFailuresFromFacts(facts);

  const expectedCatalog = catalogSource(eventNames);
  const actualCatalog = fs.existsSync(GENERATED_CATALOG)
    ? fs.readFileSync(GENERATED_CATALOG, 'utf8')
    : '';
  if (actualCatalog !== expectedCatalog) {
    failures.push(`${ERROR_CODES.CATALOG_OUTDATED}: run "npm run migrate:backend-events".`);
  }
  const expectedCatalogTypes = catalogTypesSource(eventNames);
  const actualCatalogTypes = fs.existsSync(GENERATED_CATALOG_TYPES)
    ? fs.readFileSync(GENERATED_CATALOG_TYPES, 'utf8')
    : '';
  if (actualCatalogTypes !== expectedCatalogTypes) {
    failures.push(`${ERROR_CODES.TYPES_OUTDATED}: run "npm run migrate:backend-events".`);
  }
  const expectedSpecs = specsSource(buildContractSpecs(eventNames, facts));
  const actualSpecs = fs.existsSync(GENERATED_SPECS)
    ? fs.readFileSync(GENERATED_SPECS, 'utf8')
    : '';
  if (actualSpecs !== expectedSpecs) {
    failures.push(`${ERROR_CODES.SCHEMAS_OUTDATED}: run "npm run migrate:backend-events".`);
  }
  const expectedTypes = typesSource(buildContractSpecs(eventNames, facts));
  const actualTypes = fs.existsSync(GENERATED_TYPES)
    ? fs.readFileSync(GENERATED_TYPES, 'utf8')
    : '';
  if (actualTypes !== expectedTypes) {
    failures.push(`${ERROR_CODES.TYPES_OUTDATED}: run "npm run migrate:backend-events".`);
  }

  if (REPORT_MODE) {
    for (const fileFacts of facts) {
      for (const node of fileFacts.legacyPromiseAdapters) {
        const snippet = fileFacts.source
          .slice(node.start, node.end)
          .replace(/\s+/g, ' ')
          .slice(0, 320);
        process.stdout.write(
          `${ERROR_CODES.LEGACY_ADAPTER}\t${relative(fileFacts.filePath)}:${lineNumber(fileFacts.source, node.start)}\t${snippet}\n`
        );
      }
      for (const node of fileFacts.directCallbackEmits) {
        const eventName = eventNameValue(node.arguments[0]) || '<dynamic>';
        const lastArgument = node.arguments[node.arguments.length - 1];
        process.stdout.write(
          `${relative(fileFacts.filePath)}:${lineNumber(fileFacts.source, node.start)}\t${eventName}\t${node.arguments.length}\t${lastArgument.type}\n`
        );
      }
    }
  }

  if (failures.length) {
    process.stderr.write(`${failures.join('\n')}\n`);
    process.exitCode = 1;
    return;
  }

  if (CHECK_MODE) {
    process.stdout.write(`Backend event contract migration is current (${eventNames.size} catalog entries).\n`);
  }
}

main();
