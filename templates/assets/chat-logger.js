// Lightweight IndexedDB-based chat logger for local storage and retrieval
// Fields: userId, page, role, content, time (ISO), location {lat, lon, accuracy}, timezone
// Exposes: ChatLogger.init({userId, pageType}), ChatLogger.log({role, content, time}), ChatLogger.getByUser(userId), ChatLogger.exportByUser(userId)

(function () {
  const DB_NAME = 'LX_ChatLogs';
  const STORE_NAME = 'logs';
  const DB_VERSION = 1;

  let db = null;
  let context = { userId: null, page: null };
  let cachedLocation = null;

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
          store.createIndex('userId', 'userId', { unique: false });
          store.createIndex('page', 'page', { unique: false });
          store.createIndex('time', 'time', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Failed to open DB'));
    });
  }

  function readCachedLocation() {
    try {
      const raw = localStorage.getItem('lx_cached_location');
      if (!raw) return null;
      const obj = JSON.parse(raw);
      // cache valid for 1 hour
      if (obj && obj.ts && Date.now() - obj.ts < 60 * 60 * 1000) {
        return obj.data;
      }
    } catch (_) {}
    return null;
  }

  function writeCachedLocation(loc) {
    try {
      localStorage.setItem('lx_cached_location', JSON.stringify({ ts: Date.now(), data: loc }));
    } catch (_) {}
  }

  function getTimezone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';
    } catch (_) {
      return 'unknown';
    }
  }

  function getLocation() {
    const cached = readCachedLocation();
    if (cached) {
      cachedLocation = cached;
      return Promise.resolve(cached);
    }
    return new Promise((resolve) => {
      if (!('geolocation' in navigator)) {
        const fallback = { lat: null, lon: null, accuracy: null, source: 'none' };
        cachedLocation = fallback;
        writeCachedLocation(fallback);
        return resolve(fallback);
      }
      // Note: localhost is a secure context so geolocation can work without HTTPS
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = {
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            source: 'geolocation',
          };
          cachedLocation = loc;
          writeCachedLocation(loc);
          resolve(loc);
        },
        () => {
          const fallback = { lat: null, lon: null, accuracy: null, source: 'denied' };
          cachedLocation = fallback;
          writeCachedLocation(fallback);
          resolve(fallback);
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
      );
    });
  }

  async function ensureDB() {
    if (db) return db;
    db = await openDB();
    return db;
  }

  async function addRecord(record) {
    const database = await ensureDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readwrite');
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error('Transaction error'));
      const store = tx.objectStore(STORE_NAME);
      store.add(record);
    });
  }

  async function getByIndex(indexName, query) {
    const database = await ensureDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readonly');
      tx.onerror = () => reject(tx.error || new Error('Transaction error'));
      const store = tx.objectStore(STORE_NAME);
      const idx = store.index(indexName);
      const req = idx.getAll(query);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error || new Error('Index read error'));
    });
  }

  async function getAll() {
    const database = await ensureDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readonly');
      tx.onerror = () => reject(tx.error || new Error('Transaction error'));
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error || new Error('Store read error'));
    });
  }

  function downloadJSON(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  window.ChatLogger = {
    async init(opts) {
      context.userId = opts && opts.userId ? String(opts.userId) : null;
      context.page = opts && opts.pageType ? String(opts.pageType) : null;
      await ensureDB();
      await getLocation();
      return true;
    },

    async log(msg) {
      const record = {
        userId: msg.userId || context.userId,
        page: msg.page || context.page,
        role: msg.role,
        content: msg.content,
        time: msg.time || new Date().toISOString(),
        location: cachedLocation,
        timezone: getTimezone(),
      };
      try {
        await addRecord(record);
      } catch (e) {
        console.warn('ChatLogger log failed:', e);
      }
    },

    async getByUser(userId) {
      return getByIndex('userId', String(userId));
    },

    async exportByUser(userId) {
      const uid = String(userId);
      const list = await getByIndex('userId', uid);
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      downloadJSON(`chat_logs_${uid}_${ts}.json`, list);
    },

    async exportAll() {
      const list = await getAll();
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      downloadJSON(`chat_logs_all_${ts}.json`, list);
    }
  };
})();