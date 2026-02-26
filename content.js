window.hasWebMarkLoaded = true;

const BANNER_HEIGHT = 40;
const MAX_CAPTURE_PIXELS = 268000000;
const MAX_CAPTURE_DIMENSION = 32767;

let bannerVisible = true;
let bannerDiv = null;
let detectedCountry = null;
let detectedIp = null;
let currentSettings = { ...(window.WEB_MARK_DEFAULTS || {}) };
let layoutObserver = null;
let layoutRescanTimer = null;
const adjustedLayoutElements = new Set();

const settingsKey = window.WEB_MARK_DEFAULTS || {
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

window.toggleWebMark = function toggleWebMark() {
  bannerVisible = !bannerVisible;
  render();
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stopLayoutObserver() {
  if (layoutObserver) {
    layoutObserver.disconnect();
    layoutObserver = null;
  }
  if (layoutRescanTimer) {
    clearTimeout(layoutRescanTimer);
    layoutRescanTimer = null;
  }
}

function scheduleLayoutRescan() {
  if (!bannerVisible || !bannerDiv) return;
  if (layoutRescanTimer) return;
  layoutRescanTimer = setTimeout(() => {
    layoutRescanTimer = null;
    clearLayoutOffset();
    applyLayoutOffset();
  }, 120);
}

function collectTopPinnedElements() {
  const candidates = new Set();
  const sampleY = 8;
  const sampleXs = [
    Math.max(8, Math.floor(window.innerWidth * 0.05)),
    Math.max(8, Math.floor(window.innerWidth * 0.25)),
    Math.floor(window.innerWidth * 0.5),
    Math.max(8, Math.floor(window.innerWidth * 0.75)),
    Math.max(8, Math.floor(window.innerWidth * 0.95))
  ];

  sampleXs.forEach((x) => {
    document.elementsFromPoint(x, sampleY).forEach((el) => {
      if (!(el instanceof HTMLElement) || el === bannerDiv || el.id === 'web-mark-container') return;
      let current = el;
      while (current && current !== document.body && current !== document.documentElement) {
        const style = window.getComputedStyle(current);
        const topPx = parseFloat(style.top);
        const top = Number.isFinite(topPx) ? topPx : 0;
        if ((style.position === 'fixed' || style.position === 'sticky') && top <= 2) {
          candidates.add(current);
          break;
        }
        current = current.parentElement;
      }
    });
  });

  return candidates;
}

function clearLayoutOffset() {
  document.documentElement.classList.remove('wm-pushed');
  document.documentElement.style.removeProperty('--wm-banner-offset');
  adjustedLayoutElements.forEach((el) => {
    el.classList.remove('wm-offset-element');
    el.style.removeProperty('--wm-original-top');
  });
  adjustedLayoutElements.clear();
  stopLayoutObserver();
}

function applyLayoutOffset() {
  document.documentElement.classList.add('wm-pushed');
  document.documentElement.style.setProperty('--wm-banner-offset', `${BANNER_HEIGHT}px`);
  collectTopPinnedElements().forEach((el) => {
    if (!adjustedLayoutElements.has(el)) {
      const style = window.getComputedStyle(el);
      const topPx = parseFloat(style.top);
      const top = Number.isFinite(topPx) ? topPx : 0;
      el.style.setProperty('--wm-original-top', `${top}px`);
      el.classList.add('wm-offset-element');
      adjustedLayoutElements.add(el);
    }
  });

  layoutObserver = new MutationObserver(scheduleLayoutRescan);
  layoutObserver.observe(document.documentElement, {
    attributes: true,
    childList: true,
    subtree: true,
    attributeFilter: ['class', 'style']
  });
}

async function loadSettings() {
  currentSettings = await chrome.storage.sync.get(settingsKey);
}

async function render() {
  if (!chrome.runtime?.id) return;
  try {
    if (!Object.keys(currentSettings).length) {
      await loadSettings();
    }
    if (bannerDiv) bannerDiv.remove();
    clearLayoutOffset();
    if (!bannerVisible || !currentSettings.enabled) return;

    bannerDiv = document.createElement('div');
    bannerDiv.id = 'web-mark-container';
    bannerDiv.className = currentSettings.theme === 'dark' ? 'wm-dark' : 'wm-light';
    document.documentElement.appendChild(bannerDiv);
    applyLayoutOffset();
    updateData();
  } catch (error) {
    console.error('Web Mark render failed:', error);
  }
}

async function updateData() {
  if (!bannerDiv || !chrome.runtime?.id) return;

  try {
    const settings = currentSettings;
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
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2500);
            const res = await fetch('https://ipapi.co/json/', { signal: controller.signal });
            clearTimeout(timeoutId);
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
    const timeStr = now.toLocaleTimeString(undefined, {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: tz, timeZoneName: 'short'
    });
    const dateStr = now.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: tz });
    const viewportStr = `${window.innerWidth} x ${window.innerHeight}`;
    const userAgentStr = getUserAgentDisplay();
    const ipStr = await getPublicIp(settings.showIp);

    bannerDiv.innerHTML = `
      <div class="wm-wrap">
        ${settings.showUrl ? `<div class="wm-box wm-url-box" title="${escapeHtml(window.location.href)}"><span>URL:</span>${escapeHtml(window.location.href)}</div>` : ''}
        ${settings.showDate ? `<div class="wm-box"><span>DATE:</span>${escapeHtml(dateStr)}</div>` : ''}
        ${settings.showTime ? `<div class="wm-box"><span>TIME:</span>${escapeHtml(timeStr)}</div>` : ''}
        ${settings.showCountry ? `<div class="wm-box"><span>LOC:</span>${escapeHtml(country || 'Unknown')}</div>` : ''}
        ${settings.showIp ? `<div class="wm-box"><span>IP:</span>${escapeHtml(ipStr || 'Unavailable')}</div>` : ''}
        ${settings.showViewport ? `<div class="wm-box"><span>VIEW:</span>${escapeHtml(viewportStr)}</div>` : ''}
        ${settings.showUserAgent ? `<div class="wm-box wm-ua-box" title="${escapeHtml(userAgentStr)}"><span>UA:</span>${escapeHtml(userAgentStr)}</div>` : ''}
      </div>
      <div class="wm-actions">
        <button id="wm-screenshot" aria-label="Take screenshot" title="Download Screenshot">📷</button>
        <button id="wm-close" aria-label="Hide banner" title="Hide Banner">×</button>
      </div>
    `;

    bannerDiv.querySelector('#wm-screenshot').onclick = () => {
      handleScreenshot(settings.screenshotType);
    };
    bannerDiv.querySelector('#wm-close').onclick = () => window.toggleWebMark();
  } catch (error) {
    console.error('Web Mark update failed:', error);
  }
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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);
    const res = await fetch('https://api64.ipify.org?format=json', { signal: controller.signal });
    clearTimeout(timeoutId);
    const data = await res.json();
    detectedIp = data.ip;
    chrome.storage.local.set({ cachedIp: detectedIp, cachedIpAt: Date.now() });
    return detectedIp;
  } catch {
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

async function waitForCaptureSettle() {
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  await new Promise((resolve) => setTimeout(resolve, 80));
}

async function captureTile() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'capture_visible' }, (response) => resolve(response?.dataUrl));
  });
}

async function handleScreenshot(type) {
  if (type === 'fullpage') {
    await captureFullPageScreenshot();
  } else {
    chrome.runtime.sendMessage({ action: 'take_screenshot' });
  }
}

async function captureFullPageScreenshot() {
  const originalX = window.scrollX;
  const originalY = window.scrollY;
  const originalOverflow = document.documentElement.style.overflow;
  const hadBanner = Boolean(bannerDiv);
  const originalBannerDisplay = bannerDiv?.style.display || '';
  const wasBannerVisible = bannerVisible;

  try {
    document.documentElement.style.overflow = 'hidden';
    if (hadBanner && bannerDiv) {
      bannerDiv.style.display = 'none';
    }
    clearLayoutOffset();
    window.scrollTo(0, 0);
    await waitForCaptureSettle();

    const totalWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    const totalHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const scale = window.devicePixelRatio || 1;

    const canvasWidth = Math.round(totalWidth * scale);
    const canvasHeight = Math.round(totalHeight * scale);
    if (
      canvasWidth > MAX_CAPTURE_DIMENSION
      || canvasHeight > MAX_CAPTURE_DIMENSION
      || (canvasWidth * canvasHeight) > MAX_CAPTURE_PIXELS
    ) {
      console.warn('Web Mark full-page screenshot exceeded canvas limits. Falling back to visible screenshot.');
      chrome.runtime.sendMessage({ action: 'take_screenshot' });
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d');

    for (let y = 0; y < totalHeight; y += viewportHeight) {
      for (let x = 0; x < totalWidth; x += viewportWidth) {
        const tileWidth = Math.min(viewportWidth, totalWidth - x);
        const tileHeight = Math.min(viewportHeight, totalHeight - y);
        window.scrollTo(x, y);
        await waitForCaptureSettle();
        const dataUrl = await captureTile();
        if (!dataUrl) continue;

        await new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            const sourceWidth = Math.round(tileWidth * scale);
            const sourceHeight = Math.round(tileHeight * scale);
            ctx.drawImage(
              img,
              0,
              0,
              sourceWidth,
              sourceHeight,
              Math.round(x * scale),
              Math.round(y * scale),
              sourceWidth,
              sourceHeight
            );
            resolve();
          };
          img.src = dataUrl;
        });
      }
    }

    const fullDataUrl = canvas.toDataURL('image/png');
    chrome.runtime.sendMessage({ action: 'download_screenshot', dataUrl: fullDataUrl });
  } catch (error) {
    console.error('Web Mark full-page screenshot failed:', error);
    chrome.runtime.sendMessage({ action: 'take_screenshot' });
  } finally {
    document.documentElement.style.overflow = originalOverflow;
    if (wasBannerVisible && hadBanner && bannerDiv) {
      bannerDiv.style.display = originalBannerDisplay;
      applyLayoutOffset();
    }
    window.scrollTo(originalX, originalY);
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  Object.keys(changes).forEach((key) => {
    currentSettings[key] = changes[key].newValue;
  });
  render();
});

setInterval(() => {
  if (bannerVisible && bannerDiv && chrome.runtime?.id) {
    updateData();
  }
}, 1000);

loadSettings().then(render).catch((error) => {
  console.error('Web Mark initial load failed:', error);
  render();
});
