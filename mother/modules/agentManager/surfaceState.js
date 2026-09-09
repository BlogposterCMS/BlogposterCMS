'use strict';

// The existing AgentManager authority outlives any particular handler generation.
module.exports = { surfaceSnapshots: new Map(), surfaceCommands: new Map(), activityEvents: [] };
