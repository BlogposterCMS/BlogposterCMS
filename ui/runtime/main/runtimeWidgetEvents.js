export function createDebouncedEmitter(delay = 150) {
    let queue = [];
    let timer = null;
    return function (eventName, payload = {}) {
        return new Promise((resolve, reject) => {
            queue.push({ eventName, payload, resolve, reject });
            if (!timer) {
                timer = setTimeout(async () => {
                    const batch = queue.slice();
                    queue = [];
                    timer = null;
                    try {
                        const emitBatch = window.meltdownEmitBatch;
                        if (typeof emitBatch !== 'function') {
                            throw new Error('meltdownEmitBatch is not available');
                        }
                        const results = await emitBatch(batch.map(it => ({ eventName: it.eventName, payload: it.payload })));
                        batch.forEach((item, idx) => item.resolve(results[idx]));
                    }
                    catch (err) {
                        batch.forEach(item => item.reject(err));
                    }
                }, delay);
            }
        });
    };
}
