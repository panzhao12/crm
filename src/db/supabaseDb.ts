import {
  createClient,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import type { Contact, ContactPatch } from "../shared/types";
import { normalizeLinkedInUrl } from "../shared/profileUrl";

const TABLE = "contacts";

let client: SupabaseClient | undefined;

export function hasSupabaseConfig(): boolean {
  return Boolean(
    import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
  );
}

export function getAllowedEmail(): string {
  return (import.meta.env.VITE_ALLOWED_EMAIL ?? "").trim().toLowerCase();
}

export function getClient(): SupabaseClient {
  if (!client) {
    client = createClient(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_ANON_KEY,
    );
  }
  return client;
}

export async function getSession(): Promise<Session | null> {
  if (!hasSupabaseConfig()) return null;
  const { data, error } = await getClient().auth.getSession();
  if (error) throw error;
  return data.session;
}

export function onAuthChange(
  callback: (session: Session | null) => void,
): () => void {
  if (!hasSupabaseConfig()) return () => undefined;
  const { data } = getClient().auth.onAuthStateChange((_event, session) =>
    callback(session),
  );
  return () => data.subscription.unsubscribe();
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<void> {
  const { error } = await getClient().auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
}

export async function signUpWithPassword(
  email: string,
  password: string,
): Promise<void> {
  const allowedEmail = getAllowedEmail();
  if (allowedEmail && email.trim().toLowerCase() !== allowedEmail) {
    throw new Error(
      "This CRM is private. Registration is limited to the owner account.",
    );
  }

  const { error } = await getClient().auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: window.location.origin + window.location.pathname,
    },
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const { error } = await getClient().auth.signOut();
  if (error) throw error;
}

function fromDb(row: Record<string, unknown>): Contact {
  return {
    id: String(row.id),
    firstName: String(row.first_name ?? ""),
    lastName: String(row.last_name ?? ""),
    name: String(row.name ?? ""),
    headline: String(row.headline ?? ""),
    company: String(row.company ?? ""),
    position: String(row.position ?? ""),
    location: String(row.location ?? ""),
    email: String(row.email ?? ""),
    profileUrl: String(row.profile_url ?? ""),
    profileImage: String(row.profile_image ?? ""),
    connectedOn: String(row.connected_on ?? ""),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    group: String(row.group_name ?? ""),
    category: String(row.category ?? row.group_name ?? ""),
    notes: String(row.notes ?? ""),
    nextFollowUp: String(row.next_follow_up ?? ""),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

async function currentUserId(): Promise<string> {
  const session = await getSession();
  const userId = session?.user.id;
  if (!userId) throw new Error("You must be signed in to save contacts.");
  return userId;
}

async function toDb(contact: Contact): Promise<Record<string, unknown>> {
  return {
    id: contact.id,
    user_id: await currentUserId(),
    first_name: contact.firstName,
    last_name: contact.lastName,
    name: contact.name,
    headline: contact.headline,
    company: contact.company,
    position: contact.position,
    location: contact.location,
    email: contact.email,
    profile_url: normalizeLinkedInUrl(contact.profileUrl),
    profile_image: contact.profileImage,
    connected_on: contact.connectedOn,
    tags: contact.tags,
    group_name: contact.group || contact.category,
    category: contact.category || contact.group,
    notes: contact.notes,
    next_follow_up: contact.nextFollowUp || null,
    created_at: contact.createdAt,
    updated_at: contact.updatedAt,
  };
}

export async function getAllContacts(): Promise<Contact[]> {
  const { data, error } = await getClient()
    .from(TABLE)
    .select("*")
    .order("name");
  if (error) throw error;
  return (data ?? []).map(fromDb);
}

export async function saveContact(contact: Contact): Promise<void> {
  const { error } = await getClient()
    .from(TABLE)
    .upsert(await toDb(contact));
  if (error) throw error;
}

export async function saveContacts(contacts: Contact[]): Promise<void> {
  if (!contacts.length) return;
  const rows = await Promise.all(contacts.map(toDb));
  const { error } = await getClient().from(TABLE).upsert(rows);
  if (error) throw error;
}

export async function updateContact(patch: ContactPatch): Promise<void> {
  const now = new Date().toISOString();
  const body: Record<string, unknown> = { updated_at: now };

  if (patch.firstName !== undefined) body.first_name = patch.firstName;
  if (patch.lastName !== undefined) body.last_name = patch.lastName;
  if (patch.name !== undefined) body.name = patch.name;
  if (patch.headline !== undefined) body.headline = patch.headline;
  if (patch.company !== undefined) body.company = patch.company;
  if (patch.position !== undefined) body.position = patch.position;
  if (patch.location !== undefined) body.location = patch.location;
  if (patch.email !== undefined) body.email = patch.email;
  if (patch.profileUrl !== undefined)
    body.profile_url = normalizeLinkedInUrl(patch.profileUrl);
  if (patch.profileImage !== undefined) body.profile_image = patch.profileImage;
  if (patch.connectedOn !== undefined) body.connected_on = patch.connectedOn;
  if (patch.tags !== undefined) body.tags = patch.tags;
  if (patch.group !== undefined) body.group_name = patch.group;
  if (patch.category !== undefined) body.category = patch.category;
  if (patch.notes !== undefined) body.notes = patch.notes;
  if (patch.nextFollowUp !== undefined)
    body.next_follow_up = patch.nextFollowUp || null;

  const { error } = await getClient()
    .from(TABLE)
    .update(body)
    .eq("id", patch.id);
  if (error) throw error;
}

export async function deleteContact(id: string): Promise<void> {
  const { error } = await getClient().from(TABLE).delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Profile image storage
// ---------------------------------------------------------------------------

const IMAGE_BUCKET = "profile-images";

/**
 * Download an image from a URL (e.g. LinkedIn CDN), upload it to Supabase
 * Storage, and return the permanent public URL. Uses the contact ID as the
 * filename so re-uploads overwrite the previous version.
 */
export async function uploadProfileImage(
  contactId: string,
  imageUrl: string,
): Promise<string> {
  // Download the image (runs in the browser, which has the LinkedIn cookie)
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }

  const blob = await response.blob();
  const ext = blob.type === "image/png" ? "png" : "jpg";
  const filePath = `${contactId}.${ext}`;

  // Upload to Supabase Storage (upsert = overwrite if exists)
  const { error: uploadError } = await getClient()
    .storage.from(IMAGE_BUCKET)
    .upload(filePath, blob, {
      contentType: blob.type,
      upsert: true,
    });
  if (uploadError) throw uploadError;

  // Get the permanent public URL
  const { data } = getClient()
    .storage.from(IMAGE_BUCKET)
    .getPublicUrl(filePath);

  return data.publicUrl;
}

/**
 * Delete a profile image from Supabase Storage.
 */
export async function deleteProfileImage(contactId: string): Promise<void> {
  // Try both extensions since we don't know which was used
  const { error } = await getClient()
    .storage.from(IMAGE_BUCKET)
    .remove([`${contactId}.jpg`, `${contactId}.png`]);
  if (error) throw error;
}
