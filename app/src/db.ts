import type { CredentialRecord, MessageRecord } from "./types";

const DB_NAME = "agentic-temp-inbox";
const DB_VERSION = 1;
const STORE_CREDENTIALS = "credentials";
const STORE_MESSAGES = "messages";
const STORE_LIMIT = 100;

const inMemoryCredentials: CredentialRecord[] = [];
const inMemoryMessages: MessageRecord[] = [];

const hasIndexedDB = () => typeof window !== "undefined" && "indexedDB" in window;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDB()) {
      reject(new Error("IndexedDB not supported"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_CREDENTIALS)) {
        const store = db.createObjectStore(STORE_CREDENTIALS, {
          keyPath: "id"
        });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
        const store = db.createObjectStore(STORE_MESSAGES, {
          keyPath: "id"
        });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("DB open failed"));
  });
}

function runTransaction<T>(
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  executor: (store: IDBObjectStore) => void | IDBRequest<unknown>
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    executor(store);
    tx.oncomplete = () => resolve(undefined as T);
    tx.onerror = () => reject(tx.error ?? new Error("Transaction failed"));
  });
}

async function trimStore(storeName: string): Promise<void> {
  if (!hasIndexedDB()) {
    if (storeName === STORE_CREDENTIALS && inMemoryCredentials.length > STORE_LIMIT) {
      inMemoryCredentials.splice(0, inMemoryCredentials.length - STORE_LIMIT);
    }
    if (storeName === STORE_MESSAGES && inMemoryMessages.length > STORE_LIMIT) {
      inMemoryMessages.splice(0, inMemoryMessages.length - STORE_LIMIT);
    }
    return;
  }

  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const index = store.index("timestamp");
    let count = 0;
    const cursorRequest = index.openCursor(null, "prev");

    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) return;
      count++;
      if (count > STORE_LIMIT) {
        cursor.delete();
      }
      cursor.continue();
    };

    cursorRequest.onerror = () => reject(cursorRequest.error ?? new Error("Cursor failed"));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Trim transaction failed"));
  });
  db.close();
}

export async function persistCredential(record: CredentialRecord): Promise<void> {
  if (!hasIndexedDB()) {
    inMemoryCredentials.push(record);
    inMemoryCredentials.sort((a, b) => b.timestamp - a.timestamp);
    await trimStore(STORE_CREDENTIALS);
    return;
  }

  const db = await openDatabase();
  await runTransaction<void>(db, STORE_CREDENTIALS, "readwrite", (store) => {
    store.put(record);
  });
  db.close();
  await trimStore(STORE_CREDENTIALS);
}

export async function persistMessage(record: MessageRecord): Promise<void> {
  if (!hasIndexedDB()) {
    inMemoryMessages.push(record);
    inMemoryMessages.sort((a, b) => b.timestamp - a.timestamp);
    await trimStore(STORE_MESSAGES);
    return;
  }

  const db = await openDatabase();
  await runTransaction<void>(db, STORE_MESSAGES, "readwrite", (store) => {
    store.put(record);
  });
  db.close();
  await trimStore(STORE_MESSAGES);
}

async function fetchRecords<T>(storeName: string): Promise<T[]> {
  if (!hasIndexedDB()) {
    if (storeName === STORE_CREDENTIALS) {
      return [...inMemoryCredentials] as T[];
    }
    if (storeName === STORE_MESSAGES) {
      return [...inMemoryMessages] as T[];
    }
    return [];
  }

  const db = await openDatabase();
  const results: T[] = [];

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const index = store.index("timestamp");
    const cursorRequest = index.openCursor(null, "prev");

    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) return;
      results.push(cursor.value as T);
      cursor.continue();
    };

    cursorRequest.onerror = () => reject(cursorRequest.error ?? new Error("Cursor failed"));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Read transaction failed"));
  });

  db.close();
  return results;
}

export async function loadCredentials(): Promise<CredentialRecord[]> {
  return fetchRecords<CredentialRecord>(STORE_CREDENTIALS);
}

export async function loadMessages(): Promise<MessageRecord[]> {
  return fetchRecords<MessageRecord>(STORE_MESSAGES);
}
