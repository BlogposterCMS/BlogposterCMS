// Shared styling travels with each widget into its existing shadow-root host.
export const homeStyles = `
:host{color:var(--studio-text,#1f2933);font-family:inherit}
.home-widget-frame{container:home-widget / inline-size;min-width:0}
*{box-sizing:border-box} a{color:inherit;text-decoration:none}button{font:inherit;cursor:pointer}
.home{padding:clamp(22px,3vw,38px);min-height:680px;display:flex;flex-direction:column;gap:26px;color:var(--studio-text,#1f2933)}
h2,h3,p{margin:0}h2{font-size:clamp(22px,2.2vw,30px);line-height:1.2;letter-spacing:-1px;font-weight:650}h3{font-size:17px;letter-spacing:-.3px}
.muted{color:var(--studio-text-muted,#78808d);font-size:14px;line-height:1.6}.eyebrow{color:#8370de;font-size:11px;font-weight:650;letter-spacing:1.6px;text-transform:uppercase}
.top,.actions,.project{display:flex;justify-content:space-between;align-items:center;gap:16px}.top>div{display:grid;gap:10px}
.button{display:inline-flex;justify-content:center;align-items:center;gap:9px;padding:13px 20px;border:1px solid var(--studio-border,#e7e8ed);border-radius:10px;background:var(--studio-surface-solid,#fff);font-size:14px;font-weight:550;white-space:nowrap}
.primary{background:var(--studio-text,#222631);color:var(--studio-canvas,#fff);border-color:transparent}.button:hover{filter:brightness(.95)}a:focus-visible,button:focus-visible{outline:2px solid #8370de;outline-offset:4px}
.preview{display:flex;align-items:center;justify-content:center;aspect-ratio:16/9;border:1px solid var(--studio-border,#e7e8ed);border-radius:12px;overflow:hidden;background:var(--studio-canvas-subtle,#fbfbfc);position:relative}
.preview img{width:100%;height:100%;object-fit:contain}.empty{text-align:center;display:grid;gap:16px;padding:32px}.empty img{height:42px;width:42px;margin:auto;opacity:.55}.preview-caption{font-size:12px;color:var(--studio-text-muted,#78808d)}
.project{flex-wrap:wrap}.project>div{display:grid;gap:9px}.status{font-size:13px;color:#8370de}.footer{border-top:1px solid var(--studio-border,#e7e8ed);padding-top:22px;display:flex;gap:22px;flex-wrap:wrap;margin-top:auto;font-size:13px;color:var(--studio-text-muted,#78808d)}
.metric{font-size:76px;font-weight:450;letter-spacing:-5px;line-height:1}.operation-title{font-size:18px;letter-spacing:-.4px}.chart{display:flex;align-items:end;gap:8px;height:115px;padding-bottom:10px;border-bottom:1px solid var(--studio-border,#e7e8ed)}.bar{flex:1;background:#9985ee;border-radius:3px 3px 0 0;min-height:2px}.dates{display:flex;justify-content:space-between;font-size:11px;color:var(--studio-text-muted,#78808d);margin-top:8px}
.activity{display:grid;gap:0;border-top:1px solid var(--studio-border,#e7e8ed)}.event{display:flex;gap:14px;align-items:center;padding:19px 0;border-bottom:1px solid var(--studio-border,#e7e8ed)}.event img{width:21px;height:21px;opacity:.6}.event div{min-width:0;display:grid;gap:6px}.event strong{font-size:13px;font-weight:550;overflow-wrap:anywhere}.event time{font-size:12px;color:var(--studio-text-muted,#78808d)}.accent{color:#8370de;font-size:14px}.notice{padding-top:12px;font-size:13px;line-height:1.6}.error{color:var(--studio-text,#1f2933)}
@media(max-width:600px){.home{min-height:0;padding:22px;gap:22px}.project{align-items:start}.actions{flex-wrap:wrap}.button{padding:11px 14px}.metric{font-size:60px}.footer{gap:14px}}
/* A narrow widget needs compact spacing even on a wide browser window. */
@container home-widget (max-width:600px){.home{min-height:0;padding:22px;gap:22px}.project{align-items:start}.actions{flex-wrap:wrap}.button{padding:11px 14px;white-space:normal}.metric{font-size:60px}.footer{gap:14px}.event img{flex-shrink:0}}
`;
export function mountHome(el, markup) {
    el.replaceChildren();
    const style = document.createElement('style');
    style.textContent = homeStyles;
    const root = document.createElement('section');
    root.className = 'home';
    root.innerHTML = markup;
    const frame = document.createElement('div');
    frame.className = 'home-widget-frame';
    frame.append(root);
    el.append(style, frame);
    return root;
}
export function adminHomeBase() {
    return `/${(window.ADMIN_BASE || 'admin').replace(/^\/+|\/+$/g, '')}`;
}
