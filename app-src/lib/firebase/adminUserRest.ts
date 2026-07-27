interface FirestoreRestError {
  error?: {
    message?: string;
  };
}

export interface AllowedViewsRestUpdate {
  projectId: string;
  uid: string;
  allowedViews: readonly string[];
  idToken: string;
}

export async function updateAllowedViewsWithIdToken(
  input: AllowedViewsRestUpdate,
  fetchImpl: typeof fetch = fetch,
) {
  const projectId = encodeURIComponent(input.projectId);
  const uid = encodeURIComponent(input.uid);
  const endpoint = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}?updateMask.fieldPaths=allowedViews`;
  const response = await fetchImpl(endpoint, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${input.idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: {
        allowedViews: {
          arrayValue: {
            values: input.allowedViews.map((view) => ({ stringValue: view })),
          },
        },
      },
    }),
    cache: 'no-store',
  });

  if (response.ok) return;

  let payload: FirestoreRestError = {};
  try {
    payload = await response.json() as FirestoreRestError;
  } catch {
    // Firestore can return an empty or non-JSON response during an upstream failure.
  }
  throw new Error(
    payload.error?.message
      ?? `Unable to update view permissions (Firestore status ${response.status}).`,
  );
}
