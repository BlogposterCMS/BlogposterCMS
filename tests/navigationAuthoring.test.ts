/** @jest-environment jsdom */
import { render as renderMenu } from '../ui/widgets/plainspace/public/basicwidgets/navigationMenuWidget';
import { render as renderBreadcrumb } from '../ui/widgets/plainspace/public/basicwidgets/breadcrumbWidget';
import { loadBreadcrumbPages } from '../ui/widgets/plainspace/public/basicwidgets/breadcrumbData';
import { navigationSettings } from '../ui/widgets/plainspace/public/basicwidgets/navigationSettings';
import { createNavigationInspector } from '../ui/designer/app/widgets/navigationInspector';

const items = [{label:'Docs',href:'/docs',children:[{label:'Getting started',href:'/docs/start'}]}];

describe('authored navigation', () => {
  beforeEach(() => { document.body.replaceChildren(); document.body.className=''; history.replaceState({}, '', '/docs/start'); delete window.PUBLIC_TOKEN; });

  it('keeps page links separate from keyboard-operable submenu buttons', async () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    await renderMenu(host, {instanceMetadata:{items,orientation:'vertical'}});
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/docs');
    expect(host.querySelector('[aria-current="page"]')?.textContent).toBe('Getting started');
    const toggle = host.querySelector<HTMLButtonElement>('.bp-navigation-widget__toggle')!;
    const list = host.querySelector<HTMLElement>(`#${toggle.getAttribute('aria-controls')}`)!;
    expect(list.hidden).toBe(false);
    toggle.click(); expect(list.hidden).toBe(true);
    toggle.click(); list.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    expect(list.hidden).toBe(true); expect(document.activeElement).toBe(toggle);
  });

  it('uses unique disclosure ids and controls mobile state without replacing links', async () => {
    const host = document.createElement('div');
    await renderMenu(host,{instanceMetadata:{items:[...items,...items],mobileLabel:'Chapters'}});
    const ids=Array.from(host.querySelectorAll('[id]')).map(node=>node.id);
    expect(new Set(ids).size).toBe(ids.length);
    const toggle=host.querySelector<HTMLButtonElement>('.bp-navigation-widget__mobile-toggle')!;
    toggle.click(); expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector('nav')?.dataset.mobileOpen).toBe('true');
    toggle.click(); expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(host.querySelectorAll('a')).toHaveLength(4);
  });

  it('does not mark external or section links as the current page', async () => {
    const host=document.createElement('div');
    await renderMenu(host,{instanceMetadata:{items:[{label:'Section',href:'#intro'},{label:'External',href:'https://example.com/docs/start',target:'_blank'},{label:'Same page',href:'/docs/start'}]}});
    expect(host.querySelectorAll('[aria-current]')).toHaveLength(1);
    expect(host.querySelector('[aria-current]')?.textContent).toBe('Same page');
    expect(host.querySelector('a[target="_blank"]')?.getAttribute('rel')).toContain('noopener');
  });

  it('ignores an older menu response after the user changes its source', async () => {
    let finish: (value: unknown)=>void = ()=>{};
    global.fetch=jest.fn().mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValueOnce({ok:true,json:async()=>({items:[{label:'New',href:'/new'}]})});
    const host=document.createElement('div');
    const old=renderMenu(host,{instanceMetadata:{locationKey:'old'}});
    await renderMenu(host,{instanceMetadata:{locationKey:'new'}});
    finish({ok:true,json:async()=>({items:[{label:'Old',href:'/old'}]})}); await old;
    expect(host.querySelector('a')?.textContent).toBe('New');
  });

  it('uses the existing Studio bridge for active navigation preview', async () => {
    document.body.classList.add('builder-mode');
    const emit = jest.fn().mockResolvedValue({resource:'navigation',action:'tree',data:{tree:items}});
    window.meltdownEmit = emit;
    await renderMenu(document.createElement('div'),{instanceMetadata:{locationKey:'docs'}});
    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest',expect.objectContaining({resource:'navigation',action:'tree',params:{locationKey:'docs',status:'active'}}));
    delete window.meltdownEmit;
  });

  it('uses page titles and actual parent IDs even when slugs are not nested', async () => {
    const emit=jest.fn(async (_event,payload)=>({resource:'pages',action:payload.action,data:payload.action==='getBySlug'
      ? {id:3,title:'First steps',slug:'docs/start',parent_id:2,status:'published',lane:'public'}
      : {id:2,title:'Documentation',slug:'knowledge',status:'published',lane:'public'}}));
    const host=document.createElement('div'); await renderBreadcrumb(host,{emit,instanceMetadata:{homeLabel:'Start'}});
    expect(Array.from(host.querySelectorAll('li')).map(node=>node.textContent)).toEqual(['Start','/Documentation','/First steps']);
    expect(emit.mock.calls[1][1].params.pageId).toBe(2);
    expect(emit.mock.calls.every(call=>call[0]==='cmsPublicRuntimeRequest')).toBe(true);
  });

  it('starts a docs breadcrumb at its configured root without duplicating it', async () => {
    const host=document.createElement('div');
    await renderBreadcrumb(host,{instanceMetadata:{source:'path',homeLabel:'Docs',homeHref:'/docs',separator:'›'}});
    expect(host.textContent).toContain('Docs›Start');
    expect(host.querySelectorAll('li')).toHaveLength(2);
  });

  it('stops at unpublished ancestors and detects cycles', async () => {
    const emit=jest.fn().mockResolvedValueOnce({id:1,title:'Article',slug:'article',parent_id:2,status:'published',lane:'public'}).mockResolvedValueOnce({id:2,title:'Secret parent',slug:'private',status:'draft',lane:'public'});
    expect((await loadBreadcrumbPages('/article',{emit}))?.map(item=>item.label)).toEqual(['Article']);
    emit.mockReset().mockResolvedValue({id:1,title:'Cycle',slug:'cycle',parent_id:1,status:'published',lane:'public'});
    await expect(loadBreadcrumbPages('/cycle',{emit})).rejects.toThrow('BP_WIDGET_BREADCRUMB_HIERARCHY_CYCLE');
  });

  it('keeps the path fallback on lookup failure and records a diagnostic', async () => {
    const warning=jest.spyOn(console,'warn').mockImplementation(()=>{});
    const host=document.createElement('div');
    await renderBreadcrumb(host,{emit:jest.fn().mockRejectedValue(new Error('offline'))});
    expect(host.querySelector('[aria-current]')?.textContent).toBe('Start');
    expect(host.dataset.warningCode).toBe('BP_WIDGET_BREADCRUMB_PAGES_UNAVAILABLE');
    warning.mockRestore();
  });

  it('never substitutes an admin token for missing public context', async () => {
    window.ADMIN_TOKEN='must-not-be-used';
    const emit=jest.fn().mockResolvedValue(null);
    await loadBreadcrumbPages('/docs',{emit});
    expect(emit.mock.calls[0][1].jwt).toBeUndefined();
    delete window.ADMIN_TOKEN;
  });

  it('bounds visual settings without accepting arbitrary CSS', () => {
    expect(navigationSettings('navigationMenu',{gap:'999',fontSize:0,radius:-3,appearance:'url(evil)'})).toMatchObject({gap:48,fontSize:11,radius:0,appearance:'soft'});
  });

  it('shows source and appearance controls backed by the same selected instance', async () => {
    const inspector=document.createElement('aside');document.body.append(inspector);
    const apply=jest.fn();
    const selection={widgetId:'navigationMenu',instanceId:'menu-1',metadata:{locationKey:'docs'}};
    const panel=createNavigationInspector(inspector,{read:()=>selection,apply,loadLocations:async()=>[{key:'docs',label:'Docs navigation'},{key:'footer',label:'Footer'}]});
    panel.sync();await Promise.resolve();
    const input=inspector.querySelector<HTMLSelectElement>('[data-navigation-field="orientation"]')!;
    input.value='vertical';input.dispatchEvent(new Event('change',{bubbles:true}));
    expect(apply).toHaveBeenCalledWith({orientation:'vertical'});
    expect(inspector.querySelector<HTMLSelectElement>('[data-navigation-field="locationKey"]')?.options).toHaveLength(2);
    expect(inspector.querySelector('a')?.getAttribute('href')).toBe('/admin/content/menu');
  });

  it('shows breadcrumb controls and hides the panel for unrelated elements', () => {
    const inspector=document.createElement('aside');document.body.append(inspector);
    let selection: any={widgetId:'breadcrumb',instanceId:'crumb-1',metadata:{showHome:false}};
    const panel=createNavigationInspector(inspector,{read:()=>selection,apply:jest.fn(),loadLocations:async()=>[]});
    panel.sync();
    expect(inspector.querySelector<HTMLInputElement>('[data-navigation-field="showHome"]')?.checked).toBe(false);
    expect(inspector.querySelector('[data-navigation-field="source"]')).not.toBeNull();
    selection=null;panel.sync();expect(inspector.querySelector('section')?.hidden).toBe(true);
  });
});
