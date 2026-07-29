import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { diffEquipmentReports } from '@/lib/equipment/changeTracking';
import { firebaseConfig } from '@/lib/firebase/config';
import { authorizeRequest } from '@/lib/server/auth';
import { enforceRateLimit } from '@/lib/server/rateLimit';

const bodySchema = z.object({
  action: z.enum(['create', 'update', 'archive']),
  reportId: z.string().trim().min(1).max(180).regex(/^[^/]+$/),
  report: z.record(z.string(), z.unknown()).optional(),
  reason: z.string().trim().min(3).max(1_000),
  disposition: z.enum(['returned-working', 'returned-defective', 'lost', 'replacement', 'correction']).default('returned-working'),
});

type FirestoreValue = {
  nullValue?: null;
  booleanValue?: boolean;
  integerValue?: string;
  doubleValue?: number;
  timestampValue?: string;
  stringValue?: string;
  arrayValue?: { values?: FirestoreValue[] };
  mapValue?: { fields?: Record<string, FirestoreValue> };
};

interface FirestoreDocument {
  fields?: Record<string, FirestoreValue>;
}

interface FirestoreError {
  error?: {
    message?: string;
  };
}

function vesselName(report: Record<string, unknown> | undefined) {
  const vesselInfo = report?.vesselInfo;
  if (!vesselInfo || typeof vesselInfo !== 'object') return '';
  const name = (vesselInfo as Record<string, unknown>).vesselName;
  return typeof name === 'string' ? name.trim() : '';
}

function toFirestoreValue(value: unknown): FirestoreValue {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
  if (typeof value === 'object') {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, toFirestoreValue(nested)]),
        ),
      },
    };
  }
  return { stringValue: String(value) };
}

function fromFirestoreValue(value: FirestoreValue | undefined): unknown {
  if (!value) return undefined;
  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('stringValue' in value) return value.stringValue;
  if ('arrayValue' in value) return (value.arrayValue?.values ?? []).map(fromFirestoreValue);
  if ('mapValue' in value) {
    return Object.fromEntries(
      Object.entries(value.mapValue?.fields ?? {}).map(([key, nested]) => [key, fromFirestoreValue(nested)]),
    );
  }
  return undefined;
}

function fromFirestoreDocument(document: FirestoreDocument): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(document.fields ?? {}).map(([key, value]) => [key, fromFirestoreValue(value)]),
  );
}

async function parseFirestoreError(response: Response, fallback: string) {
  let payload: FirestoreError = {};
  try {
    payload = await response.json() as FirestoreError;
  } catch {
    // Firestore can return an empty or non-JSON response during an upstream failure.
  }
  return payload.error?.message ?? `${fallback} (Firestore status ${response.status}).`;
}

function documentUrl(collection: string, documentId: string) {
  const projectId = encodeURIComponent(firebaseConfig.projectId);
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}/${encodeURIComponent(documentId)}`;
}

function commitUrl() {
  const projectId = encodeURIComponent(firebaseConfig.projectId);
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`;
}

function documentName(collection: string, documentId: string) {
  return `projects/${firebaseConfig.projectId}/databases/(default)/documents/${collection}/${documentId}`;
}

async function getExistingReport(reportId: string, idToken: string) {
  const response = await fetch(documentUrl('reports', reportId), {
    headers: { Authorization: `Bearer ${idToken}` },
    cache: 'no-store',
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await parseFirestoreError(response, 'Unable to read the existing vessel report'));
  return await response.json() as FirestoreDocument;
}

export async function POST(request: NextRequest) {
  const authorization = await authorizeRequest(request, { view: 'equipment-accountability' });
  if (!authorization.authorized) return authorization.response;
  const rateLimited = enforceRateLimit(`equipment-change:${authorization.token.uid}`, 20, 60_000);
  if (rateLimited) return rateLimited;

  try {
    const idToken = request.headers.get('authorization')?.slice(7);
    if (!idToken) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const body = bodySchema.parse(await request.json());
    if (body.action !== 'archive' && !body.report) throw new Error('The equipment report payload is required.');
    if (body.action !== 'archive' && !vesselName(body.report)) throw new Error('Vessel Name / IMO No. is required.');

    const existingDocument = await getExistingReport(body.reportId, idToken);
    const existing = existingDocument ? fromFirestoreDocument(existingDocument) : null;
    const isAdmin = authorization.profile.role === 'admin';

    if (body.action === 'create' && existing) throw new Error('A vessel report with this identifier already exists.');
    if (body.action !== 'create' && !existing) throw new Error('The selected vessel report no longer exists.');
    if (existing && !isAdmin && existing.uid !== authorization.token.uid) {
      throw new Error('You can only change equipment reports that you created.');
    }

    const nextReport = body.action === 'archive' ? null : body.report!;
    const changes = diffEquipmentReports(existing, nextReport);
    const reportName = vesselName(body.report) || vesselName(existing ?? undefined) || body.reportId;
    const historyEntry = {
      action: body.action,
      reason: body.reason,
      disposition: body.disposition,
      changes,
      uid: authorization.token.uid,
      userEmail: authorization.token.email ?? '',
      recordedAt: new Date().toISOString(),
    };
    const writes: unknown[] = [];

    if (body.action === 'archive') {
      writes.push({
        update: {
          name: documentName('reports', body.reportId),
          fields: { archived: { booleanValue: true } },
        },
        updateMask: { fieldPaths: ['archived'] },
        updateTransforms: [
          { fieldPath: 'archivedAt', setToServerValue: 'REQUEST_TIME' },
          { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
          { fieldPath: 'changeHistory', appendMissingElements: { values: [toFirestoreValue(historyEntry)] } },
        ],
        currentDocument: { exists: true },
      });
    } else {
      const reportFields = Object.fromEntries(
        Object.entries({
          ...body.report,
          uid: existing?.uid ?? authorization.token.uid,
          archived: false,
        }).map(([key, value]) => [key, toFirestoreValue(value)]),
      );
      if (existingDocument?.fields?.createdAt) {
        reportFields.createdAt = existingDocument.fields.createdAt;
      }
      if (existingDocument?.fields?.changeHistory) {
        reportFields.changeHistory = existingDocument.fields.changeHistory;
      }
      writes.push({
        update: {
          name: documentName('reports', body.reportId),
          fields: reportFields,
        },
        updateTransforms: [
          ...(!existingDocument?.fields?.createdAt
            ? [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }]
            : []),
          { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
          { fieldPath: 'changeHistory', appendMissingElements: { values: [toFirestoreValue(historyEntry)] } },
        ],
        currentDocument: body.action === 'create' ? { exists: false } : { exists: true },
      });
    }

    const commitResponse = await fetch(commitUrl(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ writes }),
      cache: 'no-store',
    });

    if (!commitResponse.ok) {
      throw new Error(await parseFirestoreError(commitResponse, 'Unable to save the equipment change'));
    }

    return NextResponse.json({ reportId: body.reportId, vesselName: reportName, changes });
  } catch (error) {
    console.error('[equipment-report-change] Error:', error);
    const message = error instanceof Error ? error.message : 'Unable to save the equipment change.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
