import { auth } from '@/lib/firebase/client';
import type { DailyLogRecord, VoyageDefinition } from './types';
import { appendDailyLogHistory, normalizeVesselVoyageDefinitions, vesselHistoryId } from './history';
import { cleanVesselName } from './vessel';

const DATABASE_NAME = 'aimf-vessel-reporting';
const DATABASE_VERSION = 1;
const HISTORY_STORE = 'vesselHistories';

export interface SavedVesselHistorySummary {
  id: string;
  vesselName: string;
  entryCount: number;
  firstDate: string;
  lastDate: string;
  updatedAt: string;
}

export interface SavedVesselHistory extends SavedVesselHistorySummary {
  dailyLogs: DailyLogRecord[];
  definitions: VoyageDefinition[];
  removedLegacyVoyageCount?: number;
}

interface StoredVesselHistory extends SavedVesselHistory {
  storageKey: string;
  ownerUid: string;
}

export interface SaveVesselHistoryResult {
  id: string;
  added: number;
  skipped: number;
  total: number;
}

function currentUserId() {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in again before using saved vessel history.');
  return uid;
}

function storageKey(uid: string, historyId: string) {
  return `${uid}:${historyId}`;
}

function openHistoryDatabase() {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('Saved history is not available in this browser.'));
  }

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(HISTORY_STORE)) {
        const store = database.createObjectStore(HISTORY_STORE, { keyPath: 'storageKey' });
        store.createIndex('ownerUid', 'ownerUid');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open saved vessel history.'));
  });
}

async function readAllForUser(uid: string) {
  const database = await openHistoryDatabase();
  return new Promise<StoredVesselHistory[]>((resolve, reject) => {
    const transaction = database.transaction(HISTORY_STORE, 'readonly');
    const request = transaction.objectStore(HISTORY_STORE).index('ownerUid').getAll(uid);
    request.onsuccess = () => resolve(request.result as StoredVesselHistory[]);
    request.onerror = () => reject(request.error ?? new Error('Unable to read saved vessel history.'));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => database.close();
  });
}

async function readHistory(uid: string, historyId: string) {
  const database = await openHistoryDatabase();
  return new Promise<StoredVesselHistory | undefined>((resolve, reject) => {
    const transaction = database.transaction(HISTORY_STORE, 'readonly');
    const request = transaction.objectStore(HISTORY_STORE).get(storageKey(uid, historyId));
    request.onsuccess = () => resolve(request.result as StoredVesselHistory | undefined);
    request.onerror = () => reject(request.error ?? new Error('Unable to load the saved vessel.'));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => database.close();
  });
}

async function writeHistory(history: StoredVesselHistory) {
  const database = await openHistoryDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(HISTORY_STORE, 'readwrite');
    transaction.objectStore(HISTORY_STORE).put(history);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error('Unable to save the vessel history.'));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error('The vessel history save was interrupted.'));
    };
  });
}

export async function listSavedVesselHistories() {
  const histories = await readAllForUser(currentUserId());
  return histories
    .map(({ id, vesselName, entryCount, firstDate, lastDate, updatedAt }) => ({
      id,
      vesselName,
      entryCount,
      firstDate,
      lastDate,
      updatedAt,
    }))
    .sort((left, right) => left.vesselName.localeCompare(right.vesselName));
}

export async function loadSavedVesselHistory(historyId: string) {
  const history = await readHistory(currentUserId(), historyId);
  if (!history) throw new Error('The selected saved vessel was not found in this browser.');
  const normalized = normalizeVesselVoyageDefinitions(history.definitions ?? []);
  if (normalized.removedLegacyCount > 0
    || normalized.definitions.some((definition, index) => definition.id !== history.definitions[index]?.id)) {
    await writeHistory({ ...history, definitions: normalized.definitions, updatedAt: new Date().toISOString() });
  }
  return {
    id: history.id,
    vesselName: history.vesselName,
    entryCount: history.entryCount,
    firstDate: history.firstDate,
    lastDate: history.lastDate,
    updatedAt: history.updatedAt,
    dailyLogs: history.dailyLogs,
    definitions: normalized.definitions,
    removedLegacyVoyageCount: normalized.removedLegacyCount,
  };
}

export async function saveVesselHistory(options: {
  vesselName: string;
  dailyLogs: DailyLogRecord[];
  definitions: VoyageDefinition[];
}): Promise<SaveVesselHistoryResult> {
  const uid = currentUserId();
  const selectedVessel = cleanVesselName(options.vesselName);
  const historyId = vesselHistoryId(selectedVessel);
  const existing = await readHistory(uid, historyId);
  const appended = appendDailyLogHistory(
    existing?.dailyLogs ?? [],
    options.dailyLogs,
    selectedVessel,
  );
  const dailyLogs = appended.dailyLogs;
  const dates = dailyLogs.map((daily) => daily.date);

  try {
    await writeHistory({
      storageKey: storageKey(uid, historyId),
      ownerUid: uid,
      id: historyId,
      vesselName: selectedVessel,
      entryCount: dailyLogs.length,
      firstDate: dates[0] ?? '',
      lastDate: dates.at(-1) ?? '',
      updatedAt: new Date().toISOString(),
      dailyLogs,
      definitions: normalizeVesselVoyageDefinitions(options.definitions).definitions,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      throw new Error('This browser has no storage space left for more vessel history.');
    }
    throw error;
  }

  return {
    id: historyId,
    added: appended.added,
    skipped: appended.skipped,
    total: dailyLogs.length,
  };
}
