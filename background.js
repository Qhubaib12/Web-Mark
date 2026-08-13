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

function normalizeGeoResult(data = {}) {
  return {
    country: data.country_name || data.country || '',
    countryCode: data.country_code || data.countryCode || '',
    ip: data.ip || ''
  };
}

async function getCurrentPublicIp() {
  const data = await fetchJsonWithTimeout('https://api64.ipify.org?format=json');
  if (!data.ip) {
    throw new Error('Public IP was not returned by the IP service.');
  }
  return data.ip;
}

async function detectGeoLocation() {
  const cacheMaxAgeMs = 5 * 60 * 1000;
  const cached = await chrome.storage.local.get(['cachedGeo', 'cachedGeoAt']);
  let currentIp = '';

  try {
    currentIp = await getCurrentPublicIp();
    if (
      cached.cachedGeo?.country
      && cached.cachedGeo?.ip === currentIp
      && cached.cachedGeoAt
      && (Date.now() - cached.cachedGeoAt) < cacheMaxAgeMs
    ) {
      return { ok: true, ...cached.cachedGeo };
    }
  } catch (error) {
    console.warn('Web Mark could not preflight public IP:', error);
  }

  const providers = [
    currentIp ? `https://ipapi.co/${currentIp}/json/` : 'https://ipapi.co/json/',
    currentIp ? `https://ipwho.is/${currentIp}` : 'https://ipwho.is/'
  ];
  const errors = [];

  for (const provider of providers) {
    try {
      const data = await fetchJsonWithTimeout(provider);
      const geo = normalizeGeoResult(data);
      if (currentIp) geo.ip = currentIp;
      if (!geo.country) {
        throw new Error('Country was not returned by the location service.');
      }

      await chrome.storage.local.set({ cachedGeo: geo, cachedGeoAt: Date.now() });
      await chrome.storage.local.remove(['cachedCountry']);
      return { ok: true, ...geo };
    } catch (error) {
      errors.push(`${provider}: ${error.message}`);
    }
  }

  throw new Error(errors.join('; '));
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
