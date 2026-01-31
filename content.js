window.hasWebMarkLoaded = true;
let bannerVisible = true;
let bannerDiv = null;
let detectedCountry = null;
let detectedIp = null;
const settingsKey = {
  enabled: true,
  showUrl: true,
  showDate: true,
  showTime: true,
  showCountry: true,
  showIp: false,
  showViewport: false,
  showUserAgent: false,
  timezone: 'auto',
  manualCountry: '',
  theme: 'light',
  screenshotType: 'visible'
};

window.toggleWebMark = function() { bannerVisible = !bannerVisible; render(); };

async function render() {
  if (!chrome.runtime?.id) return;
  try {
    const settings = await chrome.storage.sync.get(settingsKey);
    if (bannerDiv) bannerDiv.remove();
    document.documentElement.classList.remove('wm-pushed');
    if (!bannerVisible || !settings.enabled) return;
    bannerDiv = document.createElement('div');
    bannerDiv.id = 'web-mark-container';
    bannerDiv.className = settings.theme === 'dark' ? 'wm-dark' : 'wm-light';
    document.documentElement.appendChild(bannerDiv);
    document.documentElement.classList.add('wm-pushed');
    updateData();
  } catch (e) {}
}

async function updateData() {
  if (!bannerDiv || !chrome.runtime?.id) return;
  try {
    const settings = await chrome.storage.sync.get(settingsKey);
    
    let country = settings.manualCountry;
    if (!country) {
      if (detectedCountry) {
        country = detectedCountry;
      } else {
        const local = await chrome.storage.local.get(['cachedCountry']);
        if (local.cachedCountry) {
          detectedCountry = local.cachedCountry;
          country = detectedCountry;
        } else {
          try {
            const res = await fetch('https://ipapi.co/json/');
            const data = await res.json();
            detectedCountry = data.country_name;
            chrome.storage.local.set({ cachedCountry: detectedCountry });
            country = detectedCountry;
          } catch (err) {
            country = new Intl.DisplayNames(['en'], { type: 'region' }).of(new Intl.Locale(navigator.language).region || 'US');
          }
        }
      }
    }

    const now = new Date();
    const tz = settings.timezone === 'auto' ? undefined : settings.timezone;
    const timeStr = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: tz, timeZoneName: 'short' });
    const dateStr = now.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: tz });
    const viewportStr = `${window.innerWidth} x ${window.innerHeight}`;
    const userAgentStr = getUserAgentDisplay();
    const ipStr = await getPublicIp(settings.showIp);
    
    bannerDiv.innerHTML = `
      <div class="wm-wrap">
        ${settings.showUrl ? `<div class="wm-box wm-url-box" title="${window.location.href}"><span>URL:</span>${window.location.href}</div>`:''}
        ${settings.showDate ? `<div class="wm-box"><span>DATE:</span>${dateStr}</div>`:''}
        ${settings.showTime ? `<div class="wm-box"><span>TIME:</span>${timeStr}</div>`:''}
        ${settings.showCountry ? `<div class="wm-box"><span>LOC:</span>${country}</div>`:''}
        ${settings.showIp && ipStr ? `<div class="wm-box"><span>IP:</span>${ipStr}</div>`:''}
        ${settings.showViewport ? `<div class="wm-box"><span>VIEW:</span>${viewportStr}</div>`:''}
        ${settings.showUserAgent ? `<div class="wm-box wm-ua-box" title="${userAgentStr}"><span>UA:</span>${userAgentStr}</div>`:''}
      </div>
      <div class="wm-actions">
        <button id="wm-screenshot" title="Download Screenshot">📷</button>
        <button id="wm-close" title="Hide Banner">×</button>
      </div>
    `;

    bannerDiv.querySelector('#wm-screenshot').onclick = () => {
      handleScreenshot(settings.screenshotType);
    };
    bannerDiv.querySelector('#wm-close').onclick = () => window.toggleWebMark();
  } catch (e) {}
}

async function getPublicIp(shouldFetch) {
  if (!shouldFetch) return '';
  if (detectedIp) return detectedIp;
  const cached = await chrome.storage.local.get(['cachedIp', 'cachedIpAt']);
  if (cached.cachedIp && cached.cachedIpAt && (Date.now() - cached.cachedIpAt) < 10 * 60 * 1000) {
    detectedIp = cached.cachedIp;
    return detectedIp;
  }
  try {
    const res = await fetch('https://api64.ipify.org?format=json');
    const data = await res.json();
    detectedIp = data.ip;
    chrome.storage.local.set({ cachedIp: detectedIp, cachedIpAt: Date.now() });
    return detectedIp;
  } catch (err) {
    return '';
  }
}

function getUserAgentDisplay() {
  if (navigator.userAgentData?.brands?.length) {
    const primary = navigator.userAgentData.brands.find((brand) => !brand.brand.toLowerCase().includes('not')) || navigator.userAgentData.brands[0];
    const platform = navigator.userAgentData.platform || '';
    return `${primary.brand} ${primary.version}${platform ? ` • ${platform}` : ''}`;
  }
  return navigator.userAgent;
}

async function handleScreenshot(type) {
  if (type === 'fullpage') {
    await captureFullPageScreenshot();
  } else {
    chrome.runtime.sendMessage({ action: "take_screenshot" });
  }
}

async function captureFullPageScreenshot() {
  const originalX = window.scrollX;
  const originalY = window.scrollY;
  const originalOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = 'hidden';

  const totalWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
  const totalHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const scale = window.devicePixelRatio || 1;

  const canvas = document.createElement('canvas');
  canvas.width = totalWidth * scale;
  canvas.height = totalHeight * scale;
  const ctx = canvas.getContext('2d');

  for (let y = 0; y < totalHeight; y += viewportHeight) {
    for (let x = 0; x < totalWidth; x += viewportWidth) {
      window.scrollTo(x, y);
      await new Promise((resolve) => setTimeout(resolve, 200));
      const dataUrl = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "capture_visible" }, (response) => resolve(response?.dataUrl));
      });
      if (!dataUrl) continue;
      await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, x * scale, y * scale);
          resolve();
        };
        img.src = dataUrl;
      });
    }
  }

  document.documentElement.style.overflow = originalOverflow;
  window.scrollTo(originalX, originalY);

  const fullDataUrl = canvas.toDataURL('image/png');
  chrome.runtime.sendMessage({ action: "download_screenshot", dataUrl: fullDataUrl });
}

chrome.storage.onChanged.addListener(() => render());
setInterval(() => { if (bannerVisible && bannerDiv && chrome.runtime?.id) updateData(); }, 1000);
render();
