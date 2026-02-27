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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
