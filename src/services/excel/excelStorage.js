/**
 * Enterprise Excel Storage Service (IndexedDB + fallback)
 * Provides crash-resilient local persistence for workbooks without quota limits.
 */

const DB_NAME = 'pyidcc_excel_store_v1';
const DB_VERSION = 1;
const STORE_WORKBOOKS = 'workbooks';
const LAST_ACTIVE_KEY = 'pyidcc_excel_last_active_id';

// Helper to open IndexedDB
function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB is not supported in this environment'));
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_WORKBOOKS)) {
        db.createObjectStore(STORE_WORKBOOKS, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Saves a workbook to IndexedDB with automatic timestamp.
 */
export async function saveWorkbookLocally(workbook) {
  if (!workbook || !workbook.id) return null;
  const payload = {
    ...workbook,
    updatedAt: new Date().toISOString()
  };

  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_WORKBOOKS, 'readwrite');
      const store = tx.objectStore(STORE_WORKBOOKS);
      const req = store.put(payload);
      req.onsuccess = () => {
        try {
          localStorage.setItem(LAST_ACTIVE_KEY, workbook.id);
        } catch (_) {}
        resolve(payload);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('IndexedDB write error, falling back to localStorage:', err);
    try {
      localStorage.setItem(`excel_wb_${workbook.id}`, JSON.stringify(payload));
      localStorage.setItem(LAST_ACTIVE_KEY, workbook.id);
      return payload;
    } catch (e) {
      console.error('LocalStorage write error:', e);
      return payload;
    }
  }
}

/**
 * Loads a workbook by ID from IndexedDB.
 */
export async function loadWorkbookLocally(workbookId) {
  if (!workbookId) return null;

  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_WORKBOOKS, 'readonly');
      const store = tx.objectStore(STORE_WORKBOOKS);
      const req = store.get(workbookId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    try {
      const raw = localStorage.getItem(`excel_wb_${workbookId}`);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }
}

/**
 * Lists all workbooks stored locally.
 */
export async function listLocalWorkbooks() {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_WORKBOOKS, 'readonly');
      const store = tx.objectStore(STORE_WORKBOOKS);
      const req = store.getAll();
      req.onsuccess = () => {
        const list = req.result || [];
        list.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    return [];
  }
}

/**
 * Deletes a workbook from local storage.
 */
export async function deleteLocalWorkbook(workbookId) {
  if (!workbookId) return;
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_WORKBOOKS, 'readwrite');
      const store = tx.objectStore(STORE_WORKBOOKS);
      const req = store.delete(workbookId);
      req.onsuccess = () => {
        try {
          localStorage.removeItem(`excel_wb_${workbookId}`);
        } catch (_) {}
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  } catch (_) {
    try {
      localStorage.removeItem(`excel_wb_${workbookId}`);
    } catch (_) {}
  }
}

/**
 * Retrieves the last active workbook from previous session.
 */
export async function loadLastActiveWorkbook() {
  let lastId = null;
  try {
    lastId = localStorage.getItem(LAST_ACTIVE_KEY);
  } catch (_) {}

  if (lastId) {
    const wb = await loadWorkbookLocally(lastId);
    if (wb) return wb;
  }

  // Fallback: get first available workbook or null
  const all = await listLocalWorkbooks();
  return all.length > 0 ? all[0] : null;
}
