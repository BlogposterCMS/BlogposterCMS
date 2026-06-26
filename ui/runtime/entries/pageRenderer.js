import { bootPageRenderer } from '../main/pageRenderer.js';
bootPageRenderer().catch(err => {
    console.error('[Renderer] Fatal boot error:', err);
});
