type Handler<T = unknown> = (detail: T) => void;

export class Emitter {
  private readonly events: Record<string, Handler[]> = {};

  on<T = unknown>(type: string, handler: Handler<T>): void {
    (this.events[type] || (this.events[type] = [])).push(handler as Handler);
  }

  off<T = unknown>(type: string, handler: Handler<T>): void {
    if (!this.events[type]) return;
    this.events[type] = this.events[type].filter(h => h !== handler);
  }

  emit<T = unknown>(type: string, detail: T): void {
    (this.events[type] || []).forEach(handler => {
      try {
        handler(detail);
      } catch (err) {
        console.error('Emitter handler error:', err);
      }
    });
  }
}
