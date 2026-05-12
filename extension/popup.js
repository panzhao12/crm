const crmUrlInput = document.querySelector("#crmUrl");
const saveButton = document.querySelector("#saveSettings");
const addButton = document.querySelector("#addProfile");
const openButton = document.querySelector("#openCrm");
const statusNode = document.querySelector("#status");

let activeProfileUrl = "";
let activeProfileName = "";
let activeProfileHeadline = "";
let activeProfileImage = "";

function normalizeCrmUrl(value) {
  const trimmed = value.trim();
  return trimmed ? trimmed.replace(/\/?$/, "/") : "";
}

function isLinkedInProfileUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "");
    const parts = url.pathname.split("/").filter(Boolean);
    return host === "linkedin.com" && parts[0] === "in" && Boolean(parts[1]);
  } catch {
    return false;
  }
}

function normalizeLinkedInUrl(value) {
  const url = new URL(value);
  const parts = url.pathname.split("/").filter(Boolean);
  return `https://www.linkedin.com/in/${parts[1]}/`;
}

function extractNameFromTitle(title) {
  if (!title) return "";
  const parts = title.split(" | ");
  return parts[0] === "LinkedIn" ? "" : parts[0];
}

async function extractProfileInfo(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      action: "extractProfileInfo",
    });
    console.log("Extracted profile info:", response);
    return response || { name: "", profileImage: "" };
  } catch (error) {
    console.error("Failed to extract profile info:", error);
    return { name: "", profileImage: "" };
  }
}

async function getActiveTabInfo() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return {
    id: tab?.id,
    url: tab?.url || "",
    title: tab?.title || "",
  };
}

async function getCrmUrl() {
  const result = await chrome.storage.sync.get({ crmUrl: "" });
  return result.crmUrl;
}

async function saveCrmUrl() {
  const crmUrl = normalizeCrmUrl(crmUrlInput.value);
  await chrome.storage.sync.set({ crmUrl });
  crmUrlInput.value = crmUrl;
  statusNode.textContent = "CRM URL saved.";
}

async function openCrm(addCurrentProfile) {
  const crmUrl = normalizeCrmUrl(crmUrlInput.value || (await getCrmUrl()));
  if (!crmUrl) {
    statusNode.textContent = "Set your CRM URL first.";
    return;
  }

  const url = new URL(crmUrl);
  if (addCurrentProfile && activeProfileUrl) {
    url.searchParams.set("addUrl", activeProfileUrl);
    if (activeProfileName) {
      url.searchParams.set("addName", activeProfileName);
    }
    if (activeProfileHeadline) {
      url.searchParams.set("addHeadline", activeProfileHeadline);
    }
    if (activeProfileImage) {
      url.searchParams.set("addImage", activeProfileImage);
    }
  }

  await chrome.tabs.create({ url: url.toString() });
}

async function init() {
  try {
    crmUrlInput.value = await getCrmUrl();
    const {
      id: tabId,
      url: tabUrl,
      title: tabTitle,
    } = await getActiveTabInfo();

    if (isLinkedInProfileUrl(tabUrl) && tabId) {
      activeProfileUrl = normalizeLinkedInUrl(tabUrl);

      // Try to extract from page first, fallback to title
      try {
        const {
          name: extractedName,
          headline: extractedHeadline,
          profileImage,
        } = await extractProfileInfo(tabId);
        activeProfileName = extractedName || extractNameFromTitle(tabTitle);
        activeProfileHeadline = extractedHeadline || "";

        // Store profile image if available
        if (profileImage) {
          activeProfileImage = profileImage;
        }

        console.log("[LinkedIn CRM] Popup - Extracted data:", {
          name: activeProfileName,
          headline: activeProfileHeadline,
          image: activeProfileImage ? "YES" : "NO",
        });
      } catch (extractError) {
        console.error("Extraction failed, using title:", extractError);
        activeProfileName = extractNameFromTitle(tabTitle);
      }

      statusNode.textContent = "LinkedIn profile detected.";
      addButton.disabled = false;
    } else {
      statusNode.textContent = "Open a LinkedIn profile to add it.";
      addButton.disabled = true;
    }
  } catch (error) {
    console.error("Init failed:", error);
    statusNode.textContent = "Error loading extension.";
  }
}

saveButton.addEventListener("click", saveCrmUrl);
addButton.addEventListener("click", () => openCrm(true));
openButton.addEventListener("click", () => openCrm(false));

void init();
