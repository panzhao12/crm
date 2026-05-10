import * as localDb from './indexedDb';
import * as supabaseDb from './supabaseDb';
import type { Contact, ContactPatch } from '../shared/types';

export type StorageMode = 'local' | 'supabase';

export function getStorageMode(): StorageMode {
  return supabaseDb.hasSupabaseConfig() ? 'supabase' : 'local';
}

function repo() {
  return getStorageMode() === 'supabase' ? supabaseDb : localDb;
}

export function getAllContacts(): Promise<Contact[]> {
  return repo().getAllContacts();
}

export function saveContact(contact: Contact): Promise<void> {
  return repo().saveContact(contact);
}

export function saveContacts(contacts: Contact[]): Promise<void> {
  return repo().saveContacts(contacts);
}

export function updateContact(patch: ContactPatch): Promise<void> {
  return repo().updateContact(patch);
}

export function deleteContact(id: string): Promise<void> {
  return repo().deleteContact(id);
}
