const {
  fetchDesignerAppFrameDesign
} = require('../mother/server/http/adminShellRoutes');
const fs = require('fs');
const path = require('path');

test('Designer app-frame metadata uses the existing AppLoader runtime facade', async () => {
  const decodedAdmin = {
    isUser: true,
    permissions: {
      builder: {
        use: true
      }
    }
  };
  const dispatchAppLoaderEvent = jest.fn(async () => ({
    ok: true,
    handled: true,
    appName: 'designer',
    event: 'cms-app-runtime-request',
    data: {
      resource: 'designer',
      action: 'get',
      eventName: 'designer.getDesign',
      data: {
        design: {
          id: 'design-1',
          title: 'Landing page',
          version: 4
        },
        widgets: []
      }
    }
  }));

  const design = await fetchDesignerAppFrameDesign({
    adminJwt: 'admin-token',
    decodedAdmin,
    designId: 'design-1',
    dispatchAppLoaderEvent
  });

  expect(dispatchAppLoaderEvent).toHaveBeenCalledWith(
    'admin-token',
    decodedAdmin,
    'dispatchAppEvent',
    {
      appName: 'designer',
      event: 'cms-app-runtime-request',
      data: {
        eventName: 'cmsAdminApiRequest',
        payload: {
          resource: 'designer',
          action: 'get',
          params: {
            id: 'design-1'
          }
        }
      }
    }
  );
  expect(design.design.title).toBe('Landing page');
  expect(design.design.version).toBe(4);
});

test('Designer app-frame metadata keeps the manifest title when no design is returned', async () => {
  const design = await fetchDesignerAppFrameDesign({
    adminJwt: 'admin-token',
    decodedAdmin: { isUser: true },
    designId: 'missing',
    dispatchAppLoaderEvent: jest.fn(async () => ({
      ok: true,
      data: {
        resource: 'designer',
        action: 'get',
        data: null
      }
    }))
  });

  expect(design).toBeNull();
});

test('Designer browser chrome keeps the app title instead of exposing the selected design name', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../mother/server/http/adminShellRoutes.js'),
    'utf8'
  );

  expect(source).not.toContain('pageTitle = design.design.title');
  expect(source).toContain("let pageTitle = manifest.title || manifest.name || 'App';");
  expect(source).toContain("const dv = parseInt(design?.design?.version, 10);");
});
