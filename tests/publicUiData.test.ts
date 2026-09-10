/** @jest-environment jsdom */
import { createPublicUiData } from '../ui/shared/widget-ui/publicData';

test('Designer search forwards tags and projects public labels through the approved transport', async () => {
  (globalThis as any).TextDecoder = require('util').TextDecoder;
  const bytes = new Uint8Array(Buffer.from(JSON.stringify({results:[{id:1,title:'Guide',url:'/guide',meta:{tags:['academy','入门'],secret:'hidden'}}]})));
  window.fetch = jest.fn(async () => ({ok:true,headers:{get:()=> 'application/json'},body:{getReader:()=>{
    let sent=false;return {read:async()=>sent?{done:true}:(sent=true,{done:false,value:bytes})};
  }}})) as any;
  const data = createPublicUiData();
  try {
    const result = await data.request('publicSearch',{query:{tag:'academy,入门',lang:'zh'}});
    expect(window.fetch).toHaveBeenCalledWith(expect.stringContaining('tag=academy%2C'),expect.objectContaining({credentials:'omit'}));
    expect(result).toEqual({items:[{id:'1',title:'Guide',excerpt:'',path:'/guide',tags:['academy','入门']}]});
    await expect(data.request('publicSearch',{query:{private:'x'}})).rejects.toThrow('WIDGET_SERVICE_QUERY_DENIED');
  } finally { data.dispose(); }
});
