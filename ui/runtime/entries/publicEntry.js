import { bootPublicRuntime } from '../publicEntry.js';
bootPublicRuntime().catch(err => console.error(err));
