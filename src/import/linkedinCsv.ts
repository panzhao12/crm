import type { Contact } from '../shared/types';
import { normalizeLinkedInUrl } from '../shared/profileUrl';

type CsvRow = Record<string, string>;

const keyAliases: Record<string, string[]> = {
  firstName: ['First Name', 'FirstName', 'First name'],
  lastName: ['Last Name', 'LastName', 'Last name'],
  email: ['Email Address', 'Email', 'Email address'],
  company: ['Company'],
  position: ['Position', 'Job Title', 'Title'],
  profileUrl: ['URL', 'Profile URL', 'ProfileUrl', 'LinkedIn Profile'],
  connectedOn: ['Connected On', 'ConnectedOn', 'Connected on'],
  location: ['Location'],
  headline: ['Headline']
};

function read(row: CsvRow, key: keyof typeof keyAliases): string {
  const alias = keyAliases[key].find((name) => row[name] !== undefined);
  return alias ? row[alias].trim() : '';
}

export function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      row.push(field);
      field = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(field);
      field = '';
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }

  row.push(field);
  if (row.some((value) => value.trim())) rows.push(row);

  const headers = rows.shift()?.map((header) => header.trim()) ?? [];
  return rows.map((values) =>
    headers.reduce<CsvRow>((record, header, index) => {
      record[header] = values[index] ?? '';
      return record;
    }, {})
  );
}

export function contactFromLinkedInRow(row: CsvRow): Contact | undefined {
  const firstName = read(row, 'firstName');
  const lastName = read(row, 'lastName');
  const profileUrl = normalizeLinkedInUrl(read(row, 'profileUrl'));
  const email = read(row, 'email');
  const company = read(row, 'company');
  const position = read(row, 'position');
  const headline = read(row, 'headline') || [position, company].filter(Boolean).join(' at ');
  const name = [firstName, lastName].filter(Boolean).join(' ').trim();

  if (!name && !profileUrl && !email) return undefined;

  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    firstName,
    lastName,
    name: name || email || profileUrl,
    headline,
    company,
    position,
    location: read(row, 'location'),
    email,
    profileUrl,
    connectedOn: read(row, 'connectedOn'),
    tags: [],
    group: '',
    category: '',
    notes: '',
    nextFollowUp: '',
    createdAt: now,
    updatedAt: now
  };
}

export function toCsv(contacts: Contact[]): string {
  const headers = [
    'Name',
    'First Name',
    'Last Name',
    'Company',
    'Position',
    'Headline',
    'Location',
    'Email',
    'Profile URL',
    'Connected On',
    'Group',
    'Tags',
    'Next Follow Up',
    'Notes'
  ];

  const rows = contacts.map((contact) => [
    contact.name,
    contact.firstName,
    contact.lastName,
    contact.company,
    contact.position,
    contact.headline,
    contact.location,
    contact.email,
    contact.profileUrl,
    contact.connectedOn,
    contact.group || contact.category,
    contact.tags.join('; '),
    contact.nextFollowUp,
    contact.notes
  ]);

  return [headers, ...rows]
    .map((row) =>
      row
        .map((value) => {
          const escaped = value.replaceAll('"', '""');
          return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
        })
        .join(',')
    )
    .join('\n');
}
