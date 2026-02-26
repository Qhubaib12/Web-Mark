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
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['defaults.js', 'content.js']
      });
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'capture_visible') {
    chrome.tabs.captureVisibleTab(sender.tab?.windowId, { format: 'png' }, (dataUrl) => {
      sendResponse({ dataUrl });
    });
    return true;
  }

  if (message.action === 'download_screenshot') {
    chrome.downloads.download({
      url: message.dataUrl,
      filename: getScreenshotFilename(sender.tab?.url),
      saveAs: false
    });
  }

  if (message.action === 'take_screenshot') {
    chrome.tabs.captureVisibleTab(sender.tab?.windowId, { format: 'png' }, (dataUrl) => {
      chrome.downloads.download({
        url: dataUrl,
        filename: getScreenshotFilename(sender.tab?.url),
        saveAs: false
      });
    });
  }
});
