import { computed, ref } from "vue";
import { defineStore } from "pinia";
import {
  deleteContact as deleteContactFromDb,
  getAllContacts,
  getStorageMode,
  saveContact,
  saveContacts,
  updateContact as updateContactInDb,
} from "../db/contactsRepo";
import { uploadProfileImage, deleteProfileImage } from "../db/supabaseDb";
import { contactFromLinkedInRow, parseCsv, toCsv } from "../import/linkedinCsv";
import { normalizeLinkedInUrl } from "../shared/profileUrl";
import type { Contact, ContactPatch, CsvImportResult } from "../shared/types";

function contactKey(
  contact: Pick<Contact, "profileUrl" | "email" | "name" | "company">,
): string {
  if (contact.profileUrl)
    return `url:${normalizeLinkedInUrl(contact.profileUrl)}`;
  if (contact.email) return `email:${contact.email.toLowerCase()}`;
  return `name:${contact.name.toLowerCase()}|${contact.company.toLowerCase()}`;
}

function mergeImported(existing: Contact, incoming: Contact): Contact {
  return {
    ...existing,
    firstName: incoming.firstName || existing.firstName,
    lastName: incoming.lastName || existing.lastName,
    name: incoming.name || existing.name,
    headline: incoming.headline || existing.headline,
    company: incoming.company || existing.company,
    position: incoming.position || existing.position,
    location: incoming.location || existing.location,
    email: incoming.email || existing.email,
    profileUrl: incoming.profileUrl || existing.profileUrl,
    connectedOn: incoming.connectedOn || existing.connectedOn,
    group: existing.group || existing.category,
    category: existing.category || existing.group,
    updatedAt: new Date().toISOString(),
  };
}

function newPlaceholderContact(
  profileUrl: string,
  name = "",
  group = "",
  tags: string[] = [],
  profileImage = "",
  headline = "",
): Contact {
  const now = new Date().toISOString();
  const normalized = normalizeLinkedInUrl(profileUrl);

  return {
    id: crypto.randomUUID(),
    firstName: "",
    lastName: "",
    name,
    headline,
    company: "",
    position: "",
    location: "",
    email: "",
    profileUrl: normalized,
    profileImage,
    connectedOn: "",
    tags,
    group,
    category: group,
    notes: "",
    nextFollowUp: "",
    createdAt: now,
    updatedAt: now,
  };
}

export const useContactsStore = defineStore("contacts", () => {
  const contacts = ref<Contact[]>([]);
  const loading = ref(false);
  const selectedId = ref<string>("");
  const search = ref("");
  const categoryFilter = ref("");
  const tagFilter = ref("");
  const storageMode = computed(() => getStorageMode());

  const selectedContact = computed(() =>
    contacts.value.find((contact) => contact.id === selectedId.value),
  );

  const groups = computed(() =>
    [
      ...new Set(
        contacts.value
          .map((contact) => contact.group || contact.category)
          .filter(Boolean),
      ),
    ].sort(),
  );
  const categories = groups;

  const tags = computed(() =>
    [
      ...new Set(
        contacts.value.flatMap((contact) => contact.tags).filter(Boolean),
      ),
    ].sort(),
  );

  const filteredContacts = computed(() => {
    const query = search.value.trim().toLowerCase();
    return contacts.value.filter((contact) => {
      const matchesSearch =
        !query ||
        [
          contact.name,
          contact.headline,
          contact.company,
          contact.location,
          contact.email,
          contact.notes,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);
      const matchesCategory =
        !categoryFilter.value ||
        (contact.group || contact.category) === categoryFilter.value;
      const matchesTag =
        !tagFilter.value || contact.tags.includes(tagFilter.value);
      return matchesSearch && matchesCategory && matchesTag;
    });
  });

  async function load(): Promise<void> {
    loading.value = true;
    try {
      contacts.value = await getAllContacts();
      if (!selectedId.value && contacts.value[0])
        selectedId.value = contacts.value[0].id;
    } finally {
      loading.value = false;
    }
  }

  async function importCsv(text: string): Promise<CsvImportResult> {
    const rows = parseCsv(text);
    const imported = rows
      .map(contactFromLinkedInRow)
      .filter((contact): contact is Contact => Boolean(contact));
    const byKey = new Map(
      contacts.value.map((contact) => [contactKey(contact), contact]),
    );
    const toSave: Contact[] = [];
    let created = 0;
    let updated = 0;
    let skipped = rows.length - imported.length;

    for (const incoming of imported) {
      const key = contactKey(incoming);
      const existing = byKey.get(key);
      if (existing) {
        const merged = mergeImported(existing, incoming);
        toSave.push(merged);
        byKey.set(key, merged);
        updated += 1;
      } else {
        toSave.push(incoming);
        byKey.set(key, incoming);
        created += 1;
      }
    }

    if (toSave.length) await saveContacts(toSave);
    await load();
    return { created, updated, skipped };
  }

  async function updateContact(patch: ContactPatch): Promise<void> {
    await updateContactInDb(patch);
    await load();
  }

  async function createManualContact(
    profileUrl = "",
    name = "",
    group = "",
    tags: string[] = [],
    profileImage = "",
    headline = "",
  ): Promise<Contact> {
    const existing = profileUrl ? findByProfileUrl(profileUrl) : undefined;
    if (existing) {
      selectedId.value = existing.id;
      return existing;
    }

    const contact = newPlaceholderContact(
      profileUrl,
      name,
      group,
      tags,
      profileImage,
      headline,
    );

    await saveContact(contact);
    await load();
    selectedId.value = contact.id;

    // Upload the profile image to Supabase Storage in the background
    // so the LinkedIn CDN URL is replaced with a permanent one.
    if (
      profileImage &&
      profileImage.includes("media.licdn.com") &&
      getStorageMode() === "supabase"
    ) {
      uploadProfileImage(contact.id, profileImage)
        .then(async (permanentUrl) => {
          await updateContactInDb({
            id: contact.id,
            profileImage: permanentUrl,
          });
          await load();
          console.log(
            "[LinkedIn CRM] Profile image uploaded to Supabase Storage",
          );
        })
        .catch((err) => {
          console.error("[LinkedIn CRM] Failed to upload profile image:", err);
          // The LinkedIn CDN URL is kept as a fallback
        });
    }

    return contact;
  }

  async function bulkImportUrls(
    urls: string[],
    group = "",
    tags: string[] = [],
  ): Promise<CsvImportResult> {
    const uniqueUrls = [
      ...new Set(urls.map(normalizeLinkedInUrl).filter(Boolean)),
    ];
    const existingKeys = new Set(
      contacts.value.map((contact) => contactKey(contact)),
    );
    const createdContacts: Contact[] = [];
    let updated = 0;

    for (const url of uniqueUrls) {
      const existing = contacts.value.find(
        (contact) => normalizeLinkedInUrl(contact.profileUrl) === url,
      );
      if (existing) {
        const nextTags = [...new Set([...existing.tags, ...tags])];
        await updateContactInDb({
          id: existing.id,
          group: group || existing.group || existing.category,
          category: group || existing.category || existing.group,
          tags: nextTags,
        });
        updated += 1;
        continue;
      }

      const contact = newPlaceholderContact(url, "", group, tags, "", "");
      if (!existingKeys.has(contactKey(contact))) {
        createdContacts.push(contact);
        existingKeys.add(contactKey(contact));
      }
    }

    if (createdContacts.length) await saveContacts(createdContacts);
    await load();
    return {
      created: createdContacts.length,
      updated,
      skipped: urls.length - uniqueUrls.length,
    };
  }

  async function deleteContact(id: string): Promise<void> {
    // Clean up stored profile image if using Supabase
    if (getStorageMode() === "supabase") {
      deleteProfileImage(id).catch(() => {
        /* ignore – image may not exist */
      });
    }
    await deleteContactFromDb(id);
    if (selectedId.value === id) selectedId.value = "";
    await load();
  }

  function findByProfileUrl(url: string): Contact | undefined {
    const normalized = normalizeLinkedInUrl(url);
    return contacts.value.find(
      (contact) => normalizeLinkedInUrl(contact.profileUrl) === normalized,
    );
  }

  function exportCsv(): string {
    return toCsv(filteredContacts.value);
  }

  return {
    contacts,
    loading,
    selectedId,
    search,
    categoryFilter,
    tagFilter,
    selectedContact,
    storageMode,
    groups,
    categories,
    tags,
    filteredContacts,
    load,
    importCsv,
    updateContact,
    createManualContact,
    bulkImportUrls,
    deleteContact,
    findByProfileUrl,
    exportCsv,
  };
});
