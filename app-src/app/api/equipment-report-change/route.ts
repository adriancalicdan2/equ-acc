import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { diffEquipmentReports } from '@/lib/equipment/changeTracking';
import { authorizeRequest } from '@/lib/server/auth';
import { enforceRateLimit } from '@/lib/server/rateLimit';

const bodySchema = z.object({
  action: z.enum(['create', 'update', 'archive']),
  reportId: z.string().trim().min(1).max(180).regex(/^[^/]+$/),
  report: z.record(z.string(), z.unknown()).optional(),
  reason: z.string().trim().min(3).max(1_000),
  disposition: z.enum(['returned-working', 'returned-defective', 'lost', 'replacement', 'correction']).default('returned-working'),
});

function vesselName(report: Record<string, unknown> | undefined) {
  const vesselInfo = report?.vesselInfo;
  if (!vesselInfo || typeof vesselInfo !== 'object') return '';
  const name = (vesselInfo as Record<string, unknown>).vesselName;
  return typeof name === 'string' ? name.trim() : '';
}

export async function POST(request: NextRequest) {
  const authorization = await authorizeRequest(request, { view: 'equipment-accountability' });
  if (!authorization.authorized) return authorization.response;
  const rateLimited = enforceRateLimit(`equipment-change:${authorization.token.uid}`, 20, 60_000);
  if (rateLimited) return rateLimited;

  try {
    const body = bodySchema.parse(await request.json());
    if (body.action !== 'archive' && !body.report) throw new Error('The equipment report payload is required.');
    if (body.action !== 'archive' && !vesselName(body.report)) throw new Error('Vessel Name / IMO No. is required.');

    const [{ getAdminFirestore }, { FieldValue }] = await Promise.all([
      import('@/lib/firebase/admin'),
      import('firebase-admin/firestore'),
    ]);
    const db = getAdminFirestore();
    const reportRef = db.collection('reports').doc(body.reportId);
    const changeLogRef = db.collection('equipmentChangeLogs').doc();
    const movementCollection = db.collection('inventoryMovements');
    const nowIso = new Date().toISOString();

    const result = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reportRef);
      const existing = snapshot.exists ? snapshot.data() as Record<string, unknown> : null;
      const isAdmin = authorization.profile.role === 'admin';
      if (body.action === 'create' && existing) throw new Error('A vessel report with this identifier already exists.');
      if (body.action !== 'create' && !existing) throw new Error('The selected vessel report no longer exists.');
      if (existing && !isAdmin && existing.uid !== authorization.token.uid) {
        throw new Error('You can only change equipment reports that you created.');
      }

      const nextReport = body.action === 'archive' ? null : body.report!;
      const changes = diffEquipmentReports(existing, nextReport);
      const reportName = vesselName(body.report) || vesselName(existing ?? undefined) || body.reportId;

      if (body.action === 'archive') {
        transaction.set(reportRef, {
          archived: true,
          archivedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      } else {
        transaction.set(reportRef, {
          ...body.report,
          uid: existing?.uid ?? authorization.token.uid,
          createdAt: existing?.createdAt ?? FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          archived: false,
        }, { merge: false });
      }

      transaction.create(changeLogRef, {
        reportId: body.reportId,
        vesselName: reportName,
        action: body.action,
        reason: body.reason,
        disposition: body.disposition,
        changes,
        uid: authorization.token.uid,
        userEmail: authorization.token.email ?? '',
        createdAt: FieldValue.serverTimestamp(),
      });

      for (const change of changes) {
        transaction.create(movementCollection.doc(), {
          reportId: body.reportId,
          vesselName: reportName,
          itemId: change.itemId,
          itemName: change.itemName,
          added: change.added,
          removed: change.removed,
          reason: body.reason,
          disposition: body.disposition,
          uid: authorization.token.uid,
          createdAt: FieldValue.serverTimestamp(),
        });

        if (change.removed.length > 0 && !change.itemId.startsWith('bracket-')
          && ['returned-defective', 'replacement'].includes(body.disposition)) {
          transaction.set(db.collection('inventory').doc(change.itemId), {
            defectiveLog: FieldValue.arrayUnion({
              qty: change.removed.length,
              remarks: `${reportName}: ${body.reason}`,
              serialNumbers: change.removed,
              date: nowIso.slice(0, 10),
              loggedBy: authorization.token.email ?? authorization.token.uid,
            }),
          }, { merge: true });
        }
        if (change.removed.length > 0 && !change.itemId.startsWith('bracket-') && body.disposition === 'lost') {
          transaction.set(db.collection('inventory').doc(change.itemId), {
            lostLog: FieldValue.arrayUnion({
              qty: change.removed.length,
              remarks: `${reportName}: ${body.reason}`,
              serialNumbers: change.removed,
              date: nowIso.slice(0, 10),
              loggedBy: authorization.token.email ?? authorization.token.uid,
            }),
          }, { merge: true });
        }
      }

      return { reportId: body.reportId, vesselName: reportName, changes };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[equipment-report-change] Error:', error);
    const message = error instanceof Error ? error.message : 'Unable to save the equipment change.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
