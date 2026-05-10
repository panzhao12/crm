const crmUrlInput = document.querySelector('#crmUrl');
const saveButton = document.querySelector('#saveSettings');
const addButton = document.querySelector('#addProfile');
const openButton = document.querySelector('#openCrm');
const statusNode = document.querySelector('#status');

let activeProfileUrl = '';

function normalizeCrmUrl(value) {
  const trimmed = value.trim();
  return trimmed ? trimmed.replace(/\/?$/, '/') : '';
}

function isLinkedInProfileUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, '');
    const parts = url.pathname.split('/').filter(Boolean);
    return host === 'linkedin.com' && parts[0] === 'in' && Boolean(parts[1]);
  } catch {
    return false;
  }
}

function normalizeLinkedInUrl(value) {
  const url = new URL(value);
  const parts = url.pathname.split('/').filter(Boolean);
  return `https://www.linkedin.com/in/${parts[1]}/`;
}

async function getActiveTabUrl() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.url || '';
}

async function getCrmUrl() {
  const result = await chrome.storage.sync.get({ crmUrl: '' });
  return result.crmUrl;
}

async function saveCrmUrl() {
  const crmUrl = normalizeCrmUrl(crmUrlInput.value);
  await chrome.storage.sync.set({ crmUrl });
  crmUrlInput.value = crmUrl;
  statusNode.textContent = 'CRM URL saved.';
}

async function openCrm(addCurrentProfile) {
  const crmUrl = normalizeCrmUrl(crmUrlInput.value || (await getCrmUrl()));
  if (!crmUrl) {
    statusNode.textContent = 'Set your CRM URL first.';
    return;
  }

  const url = new URL(crmUrl);
  if (addCurrentProfile && activeProfileUrl) {
    url.searchParams.set('addUrl', activeProfileUrl);
  }

  await chrome.tabs.create({ url: url.toString() });
}

async function init() {
  crmUrlInput.value = await getCrmUrl();
  const tabUrl = await getActiveTabUrl();

  if (isLinkedInProfileUrl(tabUrl)) {
    activeProfileUrl = normalizeLinkedInUrl(tabUrl);
    statusNode.textContent = 'LinkedIn profile detected.';
    addButton.disabled = false;
  } else {
    statusNode.textContent = 'Open a LinkedIn profile to add it.';
    addButton.disabled = true;
  }
}

saveButton.addEventListener('click', saveCrmUrl);
addButton.addEventListener('click', () => openCrm(true));
openButton.addEventListener('click', () => openCrm(false));

void init();
