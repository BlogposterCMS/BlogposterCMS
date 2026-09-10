const {localizedContent,contentLocales} = require('../mother/modules/contentEngine/contentLocales');

test('localized reads keep canonical publication and identity without leaking another language', () => {
  const entry={id:3,permalink:'/guide',language:'en',title:'Guide',status:'draft',meta:{tags:['docs']},
    content:{html:'English',translations:[{language:'en',title:'Guide',html:'English'},{language:'zh',title:'指南',html:'中文'}]}};
  const zh=localizedContent(entry,'zh');
  expect(zh).toMatchObject({id:3,permalink:'/guide',language:'zh',title:'指南',status:'draft',content:{html:'中文'}});
  expect(zh.content.translations).toHaveLength(1);
  expect(localizedContent(entry,'de')).toBeNull();
  expect(contentLocales(entry).map(row=>row.language)).toEqual(['en','zh']);
  expect(entry.content.translations).toHaveLength(2);
});

test('legacy single-language entries work and locale expansion is bounded', () => {
  const entry={id:4,title:'Legacy',language:'en',content:{html:'Legacy'}};
  expect(localizedContent(entry,'en')).toBe(entry);
  expect(localizedContent(entry,'zh')).toBeNull();
  expect(()=>contentLocales({...entry,content:{translations:Array.from({length:65},()=>({language:'en'}))}})).toThrow('CONTENT_LOCALES_INVALID');
});
