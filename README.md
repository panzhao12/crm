# LinkedIn Contacts CRM

A small FolkX-inspired CRM for grouping and tagging LinkedIn contacts. The frontend is a Vue + Pinia SPA that can be deployed to GitHub Pages. Storage is:

- Supabase, when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are configured.
- Browser IndexedDB, when Supabase is not configured.

The app currently focuses on the safe core workflow: import LinkedIn's official connection CSV, then group, tag, search, note, and export contacts.

## Features

- LinkedIn CSV import.
- Contact groups such as `Founder`, `Investor`, `Recruiter`, `Client`.
- Free-form tags such as `Berlin`, `AI`, `Warm`, `Follow-up`.
- Notes and next follow-up date.
- Search and sidebar filters.
- CSV export.
- Bulk LinkedIn profile URL import.
- Companion Chrome extension that sends the current profile URL to the CRM.
- Supabase email/password auth when cloud sync is enabled.
- Local-only fallback for development or private offline use.

## Local Development

```bash
corepack prepare pnpm@9.15.4 --activate
corepack pnpm install
corepack pnpm dev
```

Open `http://127.0.0.1:5173`.

## Supabase Setup

1. Create a Supabase project.
2. Run [supabase/schema.sql](D:/code/linkedin/supabase/schema.sql) in the Supabase SQL editor.
3. Copy `.env.example` to `.env.local`.
4. Set:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
```

The schema enables row-level security. Each signed-in user can only read and write their own contacts.

For password login, enable the Email provider in Supabase Auth. If email confirmation is enabled, new users must confirm their email before they can sign in.

## GitHub Pages

The workflow in [.github/workflows/pages.yml](D:/code/linkedin/.github/workflows/pages.yml) builds and deploys `dist`.

Add these repository secrets if you want Supabase sync in production:

```bash
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

If these secrets are not set, the deployed app still works in local browser storage.

## Build

```bash
corepack pnpm build
```

The deployable output is generated in `dist`.

## Companion Chrome Extension

The companion extension lives in [extension](D:/code/linkedin/extension). It does not inject UI into LinkedIn and does not read LinkedIn page content. It only checks the active tab URL and opens the CRM with:

```text
?addUrl=https://www.linkedin.com/in/example/
```

To load it locally:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose "Load unpacked".
4. Select `D:\code\linkedin\extension`.
5. Open the extension popup and set your CRM URL, for example `https://yourname.github.io/linkedin/`.

When you are on a `linkedin.com/in/...` profile, click "Add current profile" to create or open that contact in the CRM.

## Bulk URL Import

Use the "Bulk URLs" button in the app to paste many LinkedIn profile URLs and assign a shared group and comma-separated tags. This is intended for URL lists you already have, without scraping LinkedIn search pages.

## Source Layout

- `src/app/web`: hosted CRM SPA.
- `src/stores`: Pinia contact store.
- `src/db`: IndexedDB and Supabase persistence.
- `src/import`: LinkedIn CSV import and CRM CSV export helpers.
- `src/shared`: shared types and LinkedIn URL normalization.
- `supabase/schema.sql`: Supabase table, indexes, and RLS policies.
