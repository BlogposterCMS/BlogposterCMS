const fs = require('fs');
const path = require('path');
const os = require('os');
const { migrationReport } = require('../tools/check-community-migration');

test('migration inventory reports incompatible code without changing data or granting access', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'bp-migration-'));
  try {
    fs.mkdirSync(path.join(root,'widgets','old'),{recursive:true});
    fs.mkdirSync(path.join(root,'data'),{recursive:true});
    const manifest = path.join(root,'widgets','old','widgetInfo.json');
    fs.writeFileSync(manifest,'{"widgetId":"old"}');
    const data = path.join(root,'data','state.json'); fs.writeFileSync(data,'{"draft":"keep","pageId":42}');
    const report = migrationReport(root);
    expect(report.writesPerformed).toBe(false);
    expect(report.extensions[0]).toMatchObject({id:'old',issues:['WIDGET_SANDBOX_MIGRATION_REQUIRED']});
    expect(fs.readFileSync(data,'utf8')).toBe('{"draft":"keep","pageId":42}');
    expect(fs.readFileSync(manifest,'utf8')).toBe('{"widgetId":"old"}');
    expect(fs.readdirSync(path.join(root,'data'))).toEqual(['state.json']);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});
