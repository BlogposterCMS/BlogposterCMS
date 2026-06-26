const LOG_LEVELS = ['silent', 'error', 'warn', 'info', 'debug'] as const;

export type LogLevel = typeof LOG_LEVELS[number];

interface LoggerOptions {
  level?: LogLevel;
  parent?: Logger;
  namespace?: string;
}

type ConsoleMethod = (...args: unknown[]) => void;

declare global {
  interface Window {
    DESIGNER_LOG_LEVEL?: LogLevel;
  }
}

function resolveLevel(level?: LogLevel): LogLevel {
  if (!level) {
    const globalLevel = typeof window !== 'undefined' ? window.DESIGNER_LOG_LEVEL : undefined;
    return (LOG_LEVELS.includes(globalLevel as LogLevel) ? globalLevel : 'warn') as LogLevel;
  }
  return (LOG_LEVELS.includes(level) ? level : 'warn') as LogLevel;
}

function levelToIndex(level: LogLevel): number {
  const idx = LOG_LEVELS.indexOf(level);
  return idx === -1 ? LOG_LEVELS.indexOf('warn') : idx;
}

export class Logger {
  private readonly namespace?: string;

  private readonly parent?: Logger;

  private level: LogLevel;

  constructor(options: LoggerOptions = {}) {
    this.namespace = options.namespace;
    this.parent = options.parent;
    this.level = resolveLevel(options.level);
  }

  child(namespace: string, options: Omit<LoggerOptions, 'namespace' | 'parent'> = {}): Logger {
    const childNamespace = this.namespace ? `${this.namespace}:${namespace}` : namespace;
    return new Logger({ ...options, namespace: childNamespace, parent: this });
  }

  setLevel(level: LogLevel): void {
    this.level = resolveLevel(level);
  }

  getLevel(): LogLevel {
    return this.level;
  }

  private shouldLog(level: LogLevel): boolean {
    const parentLevel = this.parent?.getLevel();
    const effectiveLevel = parentLevel && levelToIndex(this.level) > levelToIndex(parentLevel)
      ? parentLevel
      : this.level;
    return levelToIndex(level) <= levelToIndex(effectiveLevel);
  }

  private formatArgs(args: unknown[]): unknown[] {
    if (!this.namespace) return args;
    return [`[${this.namespace}]`, ...args];
  }

  private getConsoleMethod(level: 'error' | 'warn' | 'info' | 'debug'): ConsoleMethod | undefined {
    if (typeof console === 'undefined') return undefined;
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

  error(...args: unknown[]): void {
    if (!this.shouldLog('error')) return;
    this.getConsoleMethod('error')?.(...this.formatArgs(args));
  }

  warn(...args: unknown[]): void {
    if (!this.shouldLog('warn')) return;
    this.getConsoleMethod('warn')?.(...this.formatArgs(args));
  }

  info(...args: unknown[]): void {
    if (!this.shouldLog('info')) return;
    this.getConsoleMethod('info')?.(...this.formatArgs(args));
  }

  debug(...args: unknown[]): void {
    if (!this.shouldLog('debug')) return;
    this.getConsoleMethod('debug')?.(...this.formatArgs(args));
  }
}

export const rootLogger = new Logger({ namespace: 'designer', level: resolveLevel() });

export function createLogger(namespace: string, options: Omit<LoggerOptions, 'namespace' | 'parent'> = {}): Logger {
  return rootLogger.child(namespace, options);
}
