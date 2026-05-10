export function normalizeLinkedInUrl(value: string): string {
  const raw = value.trim();
  if (!raw) return '';

  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    const parts = url.pathname.split('/').filter(Boolean);

    if (!host.endsWith('linkedin.com') || parts[0] !== 'in' || !parts[1]) {
      return raw.replace(/\/+$/, '');
    }

    return `https://www.linkedin.com/in/${parts[1]}/`;
  } catch {
    return raw.replace(/\/+$/, '');
  }
}

export function isLinkedInProfileUrl(value: string): boolean {
  return /^https:\/\/www\.linkedin\.com\/in\/[^/]+\/?$/i.test(normalizeLinkedInUrl(value));
}
