export class Emitter {
    events = {};
    on(type, handler) {
        (this.events[type] || (this.events[type] = [])).push(handler);
    }
    off(type, handler) {
        if (!this.events[type])
            return;
        this.events[type] = this.events[type].filter(h => h !== handler);
    }
    emit(type, detail) {
        (this.events[type] || []).forEach(handler => {
            try {
                handler(detail);
            }
            catch (err) {
                console.error('Emitter handler error:', err);
            }
        });
    }
}
