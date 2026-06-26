const LOG_LEVELS = ['silent', 'error', 'warn', 'info', 'debug'];
function resolveLevel(level) {
    if (!level) {
        const globalLevel = typeof window !== 'undefined' ? window.DESIGNER_LOG_LEVEL : undefined;
        return (LOG_LEVELS.includes(globalLevel) ? globalLevel : 'warn');
    }
    return (LOG_LEVELS.includes(level) ? level : 'warn');
}
function levelToIndex(level) {
    const idx = LOG_LEVELS.indexOf(level);
    return idx === -1 ? LOG_LEVELS.indexOf('warn') : idx;
}
export class Logger {
    namespace;
    parent;
    level;
    constructor(options = {}) {
        this.namespace = options.namespace;
        this.parent = options.parent;
        this.level = resolveLevel(options.level);
    }
    child(namespace, options = {}) {
        const childNamespace = this.namespace ? `${this.namespace}:${namespace}` : namespace;
        return new Logger({ ...options, namespace: childNamespace, parent: this });
    }
    setLevel(level) {
        this.level = resolveLevel(level);
    }
    getLevel() {
        return this.level;
    }
    shouldLog(level) {
        const parentLevel = this.parent?.getLevel();
        const effectiveLevel = parentLevel && levelToIndex(this.level) > levelToIndex(parentLevel)
            ? parentLevel
            : this.level;
        return levelToIndex(level) <= levelToIndex(effectiveLevel);
    }
    formatArgs(args) {
        if (!this.namespace)
            return args;
        return [`[${this.namespace}]`, ...args];
    }
    getConsoleMethod(level) {
        if (typeof console === 'undefined')
            return undefined;
        switch (level) {
            case 'error':
                return console.error?.bind(console);
            case 'warn':
                return console.warn?.bind(console);
            case 'info':
                return console.info?.bind(console) ?? console.log?.bind(console);
            case 'debug':
                return console.debug?.bind(console) ?? console.log?.bind(console);
            default:
                return console.log?.bind(console);
        }
    }
    error(...args) {
        if (!this.shouldLog('error'))
            return;
        this.getConsoleMethod('error')?.(...this.formatArgs(args));
    }
    warn(...args) {
        if (!this.shouldLog('warn'))
            return;
        this.getConsoleMethod('warn')?.(...this.formatArgs(args));
    }
    info(...args) {
        if (!this.shouldLog('info'))
            return;
        this.getConsoleMethod('info')?.(...this.formatArgs(args));
    }
    debug(...args) {
        if (!this.shouldLog('debug'))
            return;
        this.getConsoleMethod('debug')?.(...this.formatArgs(args));
    }
}
export const rootLogger = new Logger({ namespace: 'designer', level: resolveLevel() });
export function createLogger(namespace, options = {}) {
    return rootLogger.child(namespace, options);
}
