chrome.action.onClicked.addListener((tab) => {
  if (!tab?.id || !tab?.url) return;
  if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) return;

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      if (window.hasWebMarkLoaded) {
        window.toggleWebMark();
        return true;
      }
      return false;
    }
  }).then((results) => {
    if (!results[0]?.result) {
      chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['styles.css'] });
      chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['defaults.js', 'content.js'] });
    }
  }).catch((error) => {
    console.error('Web Mark failed to inject on tab click:', error);
  });
});

const getScreenshotFilename = (tabUrl) => {
  try {
    const url = new URL(tabUrl);
    const domain = url.hostname.replace('www.', '') || 'page';
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
    return `${domain}_${dateStr}_${timeStr}.png`;
  } catch {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
    return `screenshot_${dateStr}_${timeStr}.png`;
  }
};

function captureVisible(windowId, callback) {
  chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataUrl) => {
    if (chrome.runtime.lastError) {
      callback({ ok: false, error: chrome.runtime.lastError.message });
      return;
    }
    callback({ ok: true, dataUrl });
  });
}

function downloadImage(dataUrl, tabUrl, sendResponse) {
  chrome.downloads.download({
    url: dataUrl,
    filename: getScreenshotFilename(tabUrl),
    saveAs: false
  }, (downloadId) => {
    if (chrome.runtime.lastError) {
      const error = chrome.runtime.lastError.message;
      console.error('Web Mark download failed:', error);
      sendResponse?.({ ok: false, error });
      return;
    }
    sendResponse?.({ ok: true, downloadId });
  });
}


async function fetchJsonWithTimeout(url, timeoutMs = 3000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

async function detectGeoLocation() {
  const cacheMaxAgeMs = 60 * 60 * 1000;
  const cached = await chrome.storage.local.get(['cachedGeo', 'cachedGeoAt']);
  if (cached.cachedGeo?.country && cached.cachedGeoAt && (Date.now() - cached.cachedGeoAt) < cacheMaxAgeMs) {
    return { ok: true, ...cached.cachedGeo };
  }

  const data = await fetchJsonWithTimeout('https://ipapi.co/json/');
  const geo = {
    country: data.country_name || '',
    countryCode: data.country_code || '',
    ip: data.ip || ''
  };

  if (!geo.country) {
    throw new Error('Country was not returned by the location service.');
  }

  await chrome.storage.local.set({ cachedGeo: geo, cachedGeoAt: Date.now() });
  return { ok: true, ...geo };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'get_geo_location') {
    detectGeoLocation()
      .then(sendResponse)
      .catch((error) => {
        console.error('Web Mark location detection failed:', error);
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }

  if (message.action === 'capture_visible') {
    captureVisible(sender.tab?.windowId, sendResponse);
    return true;
  }

  if (message.action === 'download_screenshot') {
    downloadImage(message.dataUrl, sender.tab?.url, sendResponse);
    return true;
  }

  if (message.action === 'take_screenshot') {
    captureVisible(sender.tab?.windowId, (captureResult) => {
      if (!captureResult.ok) {
        sendResponse({ ok: false, error: captureResult.error });
        return;
      }
      downloadImage(captureResult.dataUrl, sender.tab?.url, sendResponse);
    });
    return true;
  }

  return false;
});
