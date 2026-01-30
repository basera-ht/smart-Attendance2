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

const createId = () => `sw_${Date.now()}_${Math.random().toString(16).slice(2)}`;

const enqueueRecord = async (record) => {
  const db = await openDb();
  const payload = {
    id: createId(),
    status: 'PENDING',
    syncAttempts: 0,
    nextRetryAt: Date.now(),
    createdAt: new Date().toISOString(),
    ...record
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(payload);
    request.onsuccess = () => resolve(payload);
    request.onerror = () => reject(request.error);
  });
};

const listRecords = async () => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
};

const updateRecord = async (record) => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(record);
    request.onsuccess = () => resolve(record);
    request.onerror = () => reject(request.error);
  });
};

const removeRecord = async (id) => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
};

const backoffDelay = (attempts) => Math.min(60000, Math.pow(2, attempts) * 1000);

const syncQueue = async () => {
  const records = await listRecords();
  const ready = records.filter((record) => record.status === 'PENDING' && record.nextRetryAt <= Date.now());
  if (!ready.length) return;

    const payload = ready.map((record) => ({
    id: record.id,
    token: record.token,
    scannedAt: record.scannedAt,
    networkState: record.networkState || 'OFFLINE',
    networkType: record.networkType,
      ssid: record.ssid
  }));

  const authHeader = ready.find((record) => record.authHeader)?.authHeader;
  if (!authHeader) {
    for (const record of ready) {
      await updateRecord({
        ...record,
        syncAttempts: (record.syncAttempts || 0) + 1,
        nextRetryAt: Date.now() + backoffDelay((record.syncAttempts || 0) + 1),
        lastError: 'Missing auth token'
      });
    }
    return;
  }

  try {
    const response = await fetch('/api/attendance/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader
      },
      body: JSON.stringify({ records: payload })
    });

    if (!response.ok) {
      throw new Error(`Sync failed: ${response.status}`);
    }

    const data = await response.json();
    const results = data?.data?.results || [];
    for (const record of ready) {
      const result = results.find((item) => item.id === record.id || item.token === record.token);
      if (result?.status === 'FINAL') {
        await removeRecord(record.id);
      } else if (result?.status === 'REJECTED') {
        await updateRecord({
          ...record,
          status: 'REJECTED',
          lastError: result.reason || 'Rejected during sync'
        });
      } else {
        await updateRecord({
          ...record,
          syncAttempts: (record.syncAttempts || 0) + 1,
          nextRetryAt: Date.now() + backoffDelay((record.syncAttempts || 0) + 1),
          lastError: 'Sync pending'
        });
      }
    }
  } catch (error) {
    for (const record of ready) {
      await updateRecord({
        ...record,
        syncAttempts: (record.syncAttempts || 0) + 1,
        nextRetryAt: Date.now() + backoffDelay((record.syncAttempts || 0) + 1),
        lastError: error.message || 'Sync failed'
      });
    }
  }
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'POST') return;

  const url = new URL(request.url);
  if (!url.pathname.endsWith('/api/attendance/submit')) return;

  event.respondWith(
    fetch(request.clone()).catch(async () => {
      let body = null;
      try {
        body = await request.clone().json();
      } catch (error) {
        body = null;
      }

      if (body) {
        await enqueueRecord({
          ...body,
          scannedAt: body.scannedAt || new Date().toISOString(),
          networkState: body.networkState || 'OFFLINE',
          authHeader: request.headers.get('Authorization')
        });
      }

      return new Response(
        JSON.stringify({ success: true, status: 'PENDING' }),
        { status: 202, headers: { 'Content-Type': 'application/json' } }
      );
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SYNC_QUEUE') {
    event.waitUntil(syncQueue());
  }
});
