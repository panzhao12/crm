// Content script for LinkedIn profiles

/**
 * Parse a srcset attribute and return the URL of the largest image.
 * srcset entries look like "url 100w, url 200w, url 400w, url 769w"
 */
function parseLargestFromSrcset(srcset) {
  let bestUrl = "";
  let bestWidth = 0;
  const entries = srcset.split(",").map((s) => s.trim());
  for (const entry of entries) {
    const parts = entry.split(/\s+/);
    if (parts.length >= 2) {
      const width = parseInt(parts[1], 10);
      if (width > bestWidth) {
        bestWidth = width;
        bestUrl = parts[0];
      }
    }
  }
  return bestUrl;
}

async function extractProfileInfo() {
  console.log("[LinkedIn CRM] Starting profile extraction...");

  // Extract name from various possible selectors
  const nameSelectors = [
    "h1.text-heading-xlarge",
    'h1[data-test-id="hero-heading"]',
    ".ph-detail h1",
    ".pv-text-details__left-panel h1",
    ".pv-top-card__content h1",
    "h1",
  ];

  let name = "";
  for (const selector of nameSelectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent?.trim()) {
      name = element.textContent.trim();
      console.log(
        `[LinkedIn CRM] Found name with selector "${selector}":`,
        name,
      );
      break;
    }
  }

  // Fallback to title
  if (!name) {
    name = document.title.split(" | ")[0]?.trim();
    if (name === "LinkedIn") name = "";
    console.log("[LinkedIn CRM] Using title for name:", name);
  }

  // Extract headline/position
  const headlineSelectors = [
    ".text-body-medium",
    ".pv-text-details__left-panel .text-body-medium",
    'div[data-test-id="hero-subtitle"]',
    ".pv-top-card__headline",
  ];

  let headline = "";
  for (const selector of headlineSelectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent?.trim()) {
      const text = element.textContent.trim();
      // Skip if it's just a date or location
      if (text.length > 5 && !text.match(/^\d+\s*(year|month|day)/i)) {
        headline = text;
        console.log(
          `[LinkedIn CRM] Found headline with selector "${selector}":`,
          headline,
        );
        break;
      }
    }
  }

  // Extract profile picture with multiple strategies
  let profileImage = "";

  // Strategy 1: LinkedIn's current DOM – the profile photo container has
  // aria-label="Profile photo" and contains a <figure> with an <img>.
  // The <img> has an empty alt="" and a srcset with multiple resolutions.
  const profilePhotoContainer = document.querySelector(
    '[aria-label="Profile photo"], [aria-label="Profile photo of"]',
  );
  if (profilePhotoContainer) {
    const img = profilePhotoContainer.querySelector("img[src]");
    if (img && img.src && img.src.startsWith("http")) {
      // Prefer the largest image from srcset if available
      const srcset = img.getAttribute("srcset");
      if (srcset) {
        const bestSrc = parseLargestFromSrcset(srcset);
        if (bestSrc) {
          profileImage = bestSrc;
          console.log(
            `[LinkedIn CRM] Found profile image from srcset:`,
            profileImage.substring(0, 120),
          );
        }
      }
      if (!profileImage) {
        profileImage = img.src;
        console.log(
          `[LinkedIn CRM] Found profile image from src:`,
          profileImage.substring(0, 120),
        );
      }
    }
  }

  // Strategy 2: Fallback selectors for older LinkedIn layouts
  if (!profileImage) {
    const fallbackSelectors = [
      'img[data-test-id="hero-image"]',
      ".pv-top-card__photo img",
      ".profile-photo img",
      'img[alt*="profile"]',
    ];

    for (const selector of fallbackSelectors) {
      const img = document.querySelector(selector);
      if (img && img.src && img.src.startsWith("http")) {
        console.log(
          `[LinkedIn CRM] Found image with fallback selector "${selector}":`,
          img.src.substring(0, 100),
        );
        profileImage = img.src;
        break;
      }
    }
  }

  // Strategy 3: Look for any img with a media.licdn.com profile photo URL
  if (!profileImage) {
    const allImgs = document.querySelectorAll(
      'img[src*="media.licdn.com"][src*="profile-displayphoto"]',
    );
    if (allImgs.length > 0) {
      profileImage = allImgs[0].src;
      console.log(
        `[LinkedIn CRM] Found image via licdn URL pattern:`,
        profileImage.substring(0, 120),
      );
    }
  }

  // NOTE: We pass the original LinkedIn CDN URL directly rather than
  // converting to a base64 data URL. The CDN URLs embed their own auth
  // tokens and work without cookies. Converting to data URL would produce
  // a ~500KB string that causes HTTP 431 errors when passed as a URL param.
  if (profileImage) {
    console.log("[LinkedIn CRM] Using CDN URL directly (length:", profileImage.length, ")");
  }

  const result = { name, headline, profileImage };
  console.log("[LinkedIn CRM] Extraction complete:", result);
  return result;
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extractProfileInfo") {
    console.log("[LinkedIn CRM] Received extraction request from popup");
    extractProfileInfo()
      .then((result) => {
        console.log("[LinkedIn CRM] Sending extracted data to popup:", result);
        sendResponse(result);
      })
      .catch((error) => {
        console.error("[LinkedIn CRM] Error during extraction:", error);
        sendResponse({ name: "", headline: "", profileImage: "" });
      });
    return true; // Keep the message channel open for async response
  }
});
