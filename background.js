chrome.action.onClicked.addListener((tab) => {
  if (tab.url.startsWith("chrome://") || tab.url.startsWith("edge://")) return;
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      if (window.hasWebMarkLoaded) { window.toggleWebMark(); return true; }
      return false;
    }
  }).then((results) => {
    if (!results[0].result) {
      chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["styles.css"] });
      chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    }
  });
});

// Handle Screenshot Request
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.action === "take_screenshot") {
    chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
      const url = new URL(sender.tab.url);
      const domain = url.hostname.replace('www.', '');
      
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
      const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-mm-ss
      
      chrome.downloads.download({
        url: dataUrl,
        filename: `${domain}_${dateStr}_${timeStr}.png`,
        saveAs: false
      });
    });
  }
});