'use strict';

// Browser-only packages select verified assets. Never evaluate their bytes on
// the server or grant them a backend event/permission surface.
module.exports = { lifecycleVersion: 1, async initialize() {}, async healthCheck() {} };
