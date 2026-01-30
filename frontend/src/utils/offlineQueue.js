const DB_NAME = 'qrOfflineQueue';
const DB_VERSION = 1;
const STORE_NAME = 'queue';

const openDb = () => new Promise((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      store.createIndex('status', 'status', { unique: false });
      store.createIndex('nextRetryAt', 'nextRetryAt', { unique: false });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const createId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `attempt_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

export const saveAttendanceAttempt = async (attempt) => {
  const db = await openDb();
  const record = {
    id: attempt.id || createId(),
    token: attempt.token,
    scannedAt: attempt.scannedAt,
    networkState: attempt.networkState,
    networkType: attempt.networkType || 'unknown',
    ssid: attempt.ssid || null,
    status: attempt.status || 'PENDING',
    syncAttempts: attempt.syncAttempts || 0,
    nextRetryAt: attempt.nextRetryAt || Date.now(),
    createdAt: attempt.createdAt || new Date().toISOString(),
    authHeader: attempt.authHeader || null
  };
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(record);
    request.onsuccess = () => resolve(record);
    request.onerror = () => reject(request.error);
  });
};

export const listQueuedRecords = async () => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
};

export const updateQueueRecord = async (record) => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(record);
    request.onsuccess = () => resolve(record);
    request.onerror = () => reject(request.error);
  });
};

export const removeQueueRecord = async (id) => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
};
