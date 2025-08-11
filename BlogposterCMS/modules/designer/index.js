'use strict';

module.exports = {
  async initialize({ motherEmitter }) {
    console.log('[DESIGNER MODULE] Initializing designer module...');

    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS designer_layouts (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE,
        layout_json JSONB,
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `;
    motherEmitter.emit(
      'performDbOperation',
      {
        moduleName: 'designer',
        moduleType: 'community',
        operation: createTableSQL,
        params: []
      },
      (err) => {
        if (err) {
          console.error('[DESIGNER MODULE] Error ensuring designer_layouts table: %s', err.message);
        }
      }
    );

    motherEmitter.on('designer.saveLayout', (payload = {}, callback) => {
      if (typeof payload !== 'object') {
        if (typeof callback === 'function') callback(new Error('Invalid payload'));
        return;
      }
      const safeName = String(payload.name || '').replace(/[\n\r]/g, '');
      if (!safeName) {
        if (typeof callback === 'function') callback(new Error('Missing layout name'));
        return;
      }
      const layoutJson = JSON.stringify(payload.layout || {});
      const sql = `
        INSERT INTO designer_layouts(name, layout_json, updated_at)
        VALUES($1, $2, NOW())
        ON CONFLICT(name)
          DO UPDATE SET layout_json = EXCLUDED.layout_json, updated_at = NOW()
      `;
      motherEmitter.emit(
        'performDbOperation',
        {
          moduleName: 'designer',
          moduleType: 'community',
          operation: sql,
          params: [safeName, layoutJson]
        },
        (err) => {
          if (typeof callback !== 'function') return;
          if (err) return callback(err);
          callback(null, { success: true });
        }
      );
    });

    console.log('[DESIGNER MODULE] designer module initialized.');
  }
};
