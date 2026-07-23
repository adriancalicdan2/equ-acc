import { auth } from './client';

const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please sign in again.';

export async function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error(SESSION_EXPIRED_MESSAGE);

  const send = async (forceRefresh: boolean) => {
    const activeUser = auth.currentUser;
    if (!activeUser || activeUser.uid !== user.uid) throw new Error(SESSION_EXPIRED_MESSAGE);
    const token = await activeUser.getIdToken(forceRefresh);
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  };

  const response = await send(false);
  if (response.status !== 401) return response;

  return send(true);
}
