<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useContactsStore } from '../../stores/contacts';
import {
  getSession,
  getAllowedEmail,
  hasSupabaseConfig,
  onAuthChange,
  signInWithPassword,
  signUpWithPassword,
  signOut
} from '../../db/supabaseDb';

const store = useContactsStore();
const importStatus = ref('');
const draftTag = ref('');
const view = ref<'all' | 'review' | 'followups'>('all');
const authEmail = ref('');
const authPassword = ref('');
const authMessage = ref('');
const authMode = ref<'sign-in' | 'sign-up'>('sign-in');
const authLoading = ref(false);
const signedInEmail = ref('');
const usesSupabase = hasSupabaseConfig();
const allowedEmail = getAllowedEmail();
const showBulkImport = ref(false);
const bulkUrls = ref('');
const bulkGroup = ref('');
const bulkTags = ref('');
const pendingAddUrl = new URLSearchParams(window.location.search).get('addUrl');

const selected = computed(() => store.selectedContact);
const groupedCounts = computed(() =>
  store.groups.map((group) => ({
    group,
    count: store.contacts.filter((contact) => (contact.group || contact.category) === group).length
  }))
);

const visibleContacts = computed(() => {
  if (view.value === 'review') {
    return store.filteredContacts.filter((contact) => !contact.group && !contact.category && contact.tags.length === 0);
  }
  if (view.value === 'followups') {
    return store.filteredContacts.filter((contact) => contact.nextFollowUp);
  }
  return store.filteredContacts;
});

onMounted(async () => {
  if (!usesSupabase) {
    await store.load();
    if (pendingAddUrl) await addUrlContact(pendingAddUrl);
    return;
  }

  const session = await getSession();
  signedInEmail.value = session?.user.email ?? '';
  if (session) {
    await store.load();
    if (pendingAddUrl) await addUrlContact(pendingAddUrl);
  }

  onAuthChange((nextSession) => {
    signedInEmail.value = nextSession?.user.email ?? '';
    if (nextSession) {
      void store.load().then(() => {
        if (pendingAddUrl) void addUrlContact(pendingAddUrl);
      });
    }
  });
});

async function submitAuth(): Promise<void> {
  const email = authEmail.value.trim();
  const password = authPassword.value;
  if (!email || !password) return;

  authLoading.value = true;
  authMessage.value = '';
  try {
    if (authMode.value === 'sign-up') {
      await signUpWithPassword(email, password);
      authMessage.value = 'Account created. Check your email if confirmation is enabled.';
    } else {
      await signInWithPassword(email, password);
    }
  } catch (error) {
    authMessage.value = error instanceof Error ? error.message : 'Authentication failed.';
  } finally {
    authLoading.value = false;
  }
}

async function handleSignOut(): Promise<void> {
  await signOut();
  signedInEmail.value = '';
  store.contacts = [];
  store.selectedId = '';
}

async function addUrlContact(url: string): Promise<void> {
  const contact = await store.createManualContact(url);
  store.selectedId = contact.id;
  window.history.replaceState({}, '', window.location.pathname);
}

async function importBulkUrls(): Promise<void> {
  const urls = bulkUrls.value
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean);
  const tags = bulkTags.value
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const result = await store.bulkImportUrls(urls, bulkGroup.value.trim(), tags);
  importStatus.value = `Added ${result.created} URLs, updated ${result.updated}, skipped ${result.skipped}.`;
  bulkUrls.value = '';
  bulkGroup.value = '';
  bulkTags.value = '';
  showBulkImport.value = false;
}

async function handleImport(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const result = await store.importCsv(await file.text());
  importStatus.value = `Imported ${result.created} new, updated ${result.updated}, skipped ${result.skipped}.`;
  input.value = '';
}

function downloadCsv(): void {
  const blob = new Blob([store.exportCsv()], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `linkedin-contacts-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function updateSelected(field: string, value: string): Promise<void> {
  if (!selected.value) return;
  await store.updateContact({ id: selected.value.id, [field]: value });
}

async function updateGroup(value: string): Promise<void> {
  if (!selected.value) return;
  await store.updateContact({ id: selected.value.id, group: value, category: value });
}

async function addTag(): Promise<void> {
  if (!selected.value) return;
  const tag = draftTag.value.trim();
  if (!tag || selected.value.tags.includes(tag)) return;
  await store.updateContact({ id: selected.value.id, tags: [...selected.value.tags, tag] });
  draftTag.value = '';
}

async function removeTag(tag: string): Promise<void> {
  if (!selected.value) return;
  await store.updateContact({ id: selected.value.id, tags: selected.value.tags.filter((item) => item !== tag) });
}
</script>

<template>
  <main v-if="usesSupabase && !signedInEmail" class="auth-shell">
    <section class="auth-card">
      <span class="brand-mark">LC</span>
      <h1>LinkedIn Contacts CRM</h1>
      <p>
        {{
          allowedEmail
            ? 'This private CRM only accepts the owner account.'
            : 'Sign in to sync your private groups, tags, and notes with Supabase.'
        }}
      </p>
      <div class="segmented-control" role="tablist" aria-label="Authentication mode">
        <button :class="{ active: authMode === 'sign-in' }" type="button" @click="authMode = 'sign-in'">Sign in</button>
        <button
          :class="{ active: authMode === 'sign-up' }"
          type="button"
          :disabled="Boolean(allowedEmail)"
          @click="authMode = 'sign-up'"
        >
          Sign up
        </button>
      </div>
      <form class="auth-form" @submit.prevent="submitAuth">
        <input v-model="authEmail" type="email" placeholder="you@example.com" />
        <input v-model="authPassword" type="password" minlength="6" placeholder="Password" />
        <button class="primary" :disabled="authLoading">
          {{ authLoading ? 'Working...' : authMode === 'sign-up' ? 'Create account' : 'Sign in' }}
        </button>
      </form>
      <p v-if="authMessage" class="status">{{ authMessage }}</p>
    </section>
  </main>

  <main v-else class="crm-app">
    <aside class="crm-sidebar">
      <div class="brand">
        <span class="brand-mark">LC</span>
        <div>
          <h1>LinkedIn CRM</h1>
          <p>{{ signedInEmail || (store.storageMode === 'supabase' ? 'Supabase sync' : 'Local mode') }}</p>
        </div>
      </div>

      <label class="search-box">
        <span>Search contacts</span>
        <input v-model="store.search" type="search" placeholder="Name, company, tag" />
      </label>

      <section class="nav-block">
        <button :class="{ active: view === 'all' }" @click="view = 'all'">All contacts</button>
        <button :class="{ active: view === 'review' }" @click="view = 'review'">Needs review</button>
        <button :class="{ active: view === 'followups' }" @click="view = 'followups'">Follow-ups</button>
      </section>

      <section class="filter-block">
        <h2>Groups</h2>
        <button :class="{ active: !store.categoryFilter }" @click="store.categoryFilter = ''">All groups</button>
        <button
          v-for="item in groupedCounts"
          :key="item.group"
          :class="{ active: store.categoryFilter === item.group }"
          @click="store.categoryFilter = item.group"
        >
          <span>{{ item.group }}</span>
          <small>{{ item.count }}</small>
        </button>
      </section>

      <section class="filter-block">
        <h2>Tags</h2>
        <button :class="{ active: !store.tagFilter }" @click="store.tagFilter = ''">All tags</button>
        <button
          v-for="tag in store.tags"
          :key="tag"
          :class="{ active: store.tagFilter === tag }"
          @click="store.tagFilter = tag"
        >
          {{ tag }}
        </button>
      </section>
    </aside>

    <section class="crm-main">
      <header class="hero-bar">
        <div>
          <p class="eyebrow">Relationship workspace</p>
          <h2>Tag and group your LinkedIn contacts</h2>
        </div>
        <div class="toolbar-actions">
          <label class="button">
            Import CSV
            <input class="visually-hidden" type="file" accept=".csv,text/csv" @change="handleImport" />
          </label>
          <button @click="downloadCsv">Export</button>
          <button @click="showBulkImport = true">Bulk URLs</button>
          <button v-if="usesSupabase" @click="handleSignOut">Sign out</button>
          <button class="primary" @click="store.createManualContact()">New contact</button>
        </div>
      </header>

      <section class="metrics-row">
        <article>
          <strong>{{ store.contacts.length }}</strong>
          <span>contacts</span>
        </article>
        <article>
          <strong>{{ store.groups.length }}</strong>
          <span>groups</span>
        </article>
        <article>
          <strong>{{ store.tags.length }}</strong>
          <span>tags</span>
        </article>
        <article>
          <strong>{{ store.contacts.filter((contact) => contact.nextFollowUp).length }}</strong>
          <span>follow-ups</span>
        </article>
      </section>

      <p v-if="importStatus" class="status">{{ importStatus }}</p>

      <div class="workspace-grid">
        <section class="contact-list">
          <div class="list-header">
            <h3>{{ visibleContacts.length }} contacts</h3>
            <p>Click a row to edit groups, tags, and notes.</p>
          </div>

          <button
            v-for="contact in visibleContacts"
            :key="contact.id"
            class="contact-row"
            :class="{ selected: store.selectedId === contact.id }"
            @click="store.selectedId = contact.id"
          >
            <span>
              <strong>{{ contact.name }}</strong>
              <small>{{ contact.headline || contact.position || contact.company || 'No headline yet' }}</small>
            </span>
            <span class="row-meta">
              <small>{{ contact.group || contact.category || 'Ungrouped' }}</small>
              <small>{{ contact.tags.slice(0, 2).join(', ') || 'No tags' }}</small>
            </span>
          </button>
        </section>

        <aside class="profile-panel">
          <template v-if="selected">
            <div class="detail-header">
              <div>
                <input
                  class="title-input"
                  :value="selected.name"
                  @change="updateSelected('name', ($event.target as HTMLInputElement).value)"
                />
                <p>{{ selected.company || selected.profileUrl || 'New contact' }}</p>
              </div>
              <button class="danger" @click="store.deleteContact(selected.id)">Delete</button>
            </div>

            <div class="form-grid">
              <label>
                Group
                <input
                  :value="selected.group || selected.category"
                  list="known-groups"
                  placeholder="Investor, Founder, Client..."
                  @change="updateGroup(($event.target as HTMLInputElement).value)"
                />
                <datalist id="known-groups">
                  <option v-for="group in store.groups" :key="group" :value="group" />
                </datalist>
              </label>
              <label>
                Next follow-up
                <input
                  :value="selected.nextFollowUp"
                  type="date"
                  @change="updateSelected('nextFollowUp', ($event.target as HTMLInputElement).value)"
                />
              </label>
              <label>
                Company
                <input :value="selected.company" @change="updateSelected('company', ($event.target as HTMLInputElement).value)" />
              </label>
              <label>
                Position
                <input :value="selected.position" @change="updateSelected('position', ($event.target as HTMLInputElement).value)" />
              </label>
              <label class="span-two">
                LinkedIn URL
                <input :value="selected.profileUrl" @change="updateSelected('profileUrl', ($event.target as HTMLInputElement).value)" />
              </label>
            </div>

            <section class="tag-editor">
              <h3>Tags</h3>
              <div class="chips">
                <button v-for="tag in selected.tags" :key="tag" class="chip removable" @click="removeTag(tag)">
                  {{ tag }}
                </button>
              </div>
              <form class="inline-form" @submit.prevent="addTag">
                <input v-model="draftTag" placeholder="Add tag" />
                <button>Add</button>
              </form>
            </section>

            <label class="notes">
              Notes
              <textarea :value="selected.notes" @change="updateSelected('notes', ($event.target as HTMLTextAreaElement).value)" />
            </label>
          </template>

          <section v-else class="empty-state">
            <h2>No contact selected</h2>
            <p>Import a LinkedIn CSV or create your first contact.</p>
          </section>
        </aside>
      </div>
    </section>

    <div v-if="showBulkImport" class="modal-backdrop" @click.self="showBulkImport = false">
      <section class="modal-card">
        <header class="detail-header">
          <div>
            <h2>Bulk add LinkedIn URLs</h2>
            <p>Paste profile URLs and apply one group and tags to all of them.</p>
          </div>
          <button @click="showBulkImport = false">Close</button>
        </header>
        <label class="notes">
          Profile URLs
          <textarea v-model="bulkUrls" placeholder="https://www.linkedin.com/in/person-one/&#10;https://www.linkedin.com/in/person-two/" />
        </label>
        <div class="form-grid">
          <label>
            Group
            <input v-model="bulkGroup" placeholder="Founder, Investor, Recruiter..." />
          </label>
          <label>
            Tags
            <input v-model="bulkTags" placeholder="AI, Berlin, Warm" />
          </label>
        </div>
        <div class="toolbar-actions">
          <button @click="showBulkImport = false">Cancel</button>
          <button class="primary" @click="importBulkUrls">Add URLs</button>
        </div>
      </section>
    </div>
  </main>
</template>
