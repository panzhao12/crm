import type { Contact, ContactPatch } from '../shared/types';
import { normalizeLinkedInUrl } from '../shared/profileUrl';

const DB_NAME = 'local-linkedin-crm';
const DB_VERSION = 1;
const CONTACTS = 'contacts';

let dbPromise: Promise<IDBDatabase> | undefined;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CONTACTS)) {
        const store = db.createObjectStore(CONTACTS, { keyPath: 'id' });
        store.createIndex('profileUrl', 'profileUrl', { unique: false });
        store.createIndex('name', 'name', { unique: false });
        store.createIndex('company', 'company', { unique: false });
        store.createIndex('category', 'category', { unique: false });
        store.createIndex('group', 'group', { unique: false });
      }
    };

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });

  return dbPromise;
}

function withStore<T>(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T> | void
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(CONTACTS, mode);
        const store = tx.objectStore(CONTACTS);
        const request = callback(store);
        let result: T;

        if (request) {
          request.onsuccess = () => {
            result = request.result;
          };
          request.onerror = () => reject(request.error);
        }

        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      })
  );
}

export async function getAllContacts(): Promise<Contact[]> {
  const contacts = await withStore<Contact[]>('readonly', (store) => store.getAll());
  return contacts.sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveContact(contact: Contact): Promise<void> {
  await withStore<IDBValidKey>('readwrite', (store) => store.put(contact));
}

export async function saveContacts(contacts: Contact[]): Promise<void> {
  await openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(CONTACTS, 'readwrite');
        const store = tx.objectStore(CONTACTS);
        contacts.forEach((contact) => store.put(contact));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      })
  );
}

export async function updateContact(patch: ContactPatch): Promise<void> {
  const contacts = await getAllContacts();
  const existing = contacts.find((contact) => contact.id === patch.id);
  if (!existing) return;

  await saveContact({
    ...existing,
    ...patch,
    profileUrl: patch.profileUrl ? normalizeLinkedInUrl(patch.profileUrl) : existing.profileUrl,
    group: patch.group ?? patch.category ?? existing.group ?? existing.category,
    category: patch.category ?? patch.group ?? existing.category ?? existing.group,
    updatedAt: new Date().toISOString()
  });
}

export async function deleteContact(id: string): Promise<void> {
  await withStore<undefined>('readwrite', (store) => store.delete(id));
}
