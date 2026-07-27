import assert from 'node:assert/strict';
import test from 'node:test';

import { updateAllowedViewsWithIdToken } from '../lib/firebase/adminUserRest.ts';

test('allowed-view updates use the caller token and patch only allowedViews', async () => {
  let requestUrl = '';
  let requestInit: RequestInit | undefined;
  const fetchMock: typeof fetch = async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return new Response('{}', { status: 200 });
  };

  await updateAllowedViewsWithIdToken({
    projectId: 'equipment-accountability',
    uid: 'user/with space',
    allowedViews: ['inventory', 'daily-logs-voyages'],
    idToken: 'admin-id-token',
  }, fetchMock);

  assert.match(requestUrl, /documents\/users\/user%2Fwith%20space/);
  assert.match(requestUrl, /updateMask\.fieldPaths=allowedViews/);
  assert.equal(requestInit?.method, 'PATCH');
  assert.deepEqual(requestInit?.headers, {
    Authorization: 'Bearer admin-id-token',
    'Content-Type': 'application/json',
  });
  assert.deepEqual(JSON.parse(String(requestInit?.body)), {
    fields: {
      allowedViews: {
        arrayValue: {
          values: [
            { stringValue: 'inventory' },
            { stringValue: 'daily-logs-voyages' },
          ],
        },
      },
    },
  });
});

test('Firestore permission errors are returned as actionable failures', async () => {
  const fetchMock: typeof fetch = async () => new Response(JSON.stringify({
    error: { message: 'Missing or insufficient permissions.' },
  }), { status: 403 });

  await assert.rejects(
    updateAllowedViewsWithIdToken({
      projectId: 'equipment-accountability',
      uid: 'user-1',
      allowedViews: [],
      idToken: 'admin-id-token',
    }, fetchMock),
    /Missing or insufficient permissions/,
  );
});
