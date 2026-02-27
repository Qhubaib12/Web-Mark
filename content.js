window.hasWebMarkLoaded = true;

const BANNER_HEIGHT = 40;
const MAX_CAPTURE_PIXELS = 120000000;
const MAX_CAPTURE_DIMENSION = 32767;
const LAYOUT_OBSERVER_LIFETIME_MS = 5000;

let bannerVisible = true;
let bannerDiv = null;
let detectedCountry = null;
let detectedIp = null;
let currentSettings = (window.WEB_MARK_NORMALIZE_SETTINGS || ((v) => v))(window.WEB_MARK_DEFAULTS || {});
let layoutObserver = null;
let layoutObserverStopTimer = null;
let layoutRescanTimer = null;
let animationBlockStyle = null;
const adjustedLayoutElements = new Set();

const normalizeSettings = window.WEB_MARK_NORMALIZE_SETTINGS || ((input) => ({ ...(window.WEB_MARK_DEFAULTS || {}), ...input }));
const settingsKey = window.WEB_MARK_DEFAULTS || {};

window.toggleWebMark = function toggleWebMark() {
  bannerVisible = !bannerVisible;
  render();
};

function getCaptureProfile(quality) {
  switch (quality) {
    case 'fast': return { settleMs: 40, disableAnimation: false };
    case 'stable': return { settleMs: 180, disableAnimation: true };
    default: return { settleMs: 100, disableAnimation: false };
  }
}

function stopLayoutObserver() {
  if (layoutObserver) {
    layoutObserver.disconnect();
    layoutObserver = null;
  }
  if (layoutObserverStopTimer) {
    clearTimeout(layoutObserverStopTimer);
    layoutObserverStopTimer = null;
  }
  if (layoutRescanTimer) {
    clearTimeout(layoutRescanTimer);
    layoutRescanTimer = null;
  }
}

function scheduleLayoutRescan() {
  if (!bannerVisible || !bannerDiv || !currentSettings.smartHeaderOffset) return;
  if (layoutRescanTimer) return;
  layoutRescanTimer = setTimeout(() => {
    layoutRescanTimer = null;
    adjustedLayoutElements.forEach((el) => {
      el.classList.remove('wm-offset-element');
      el.style.removeProperty('--wm-original-top');
    });
    adjustedLayoutElements.clear();
    applySmartHeaderOffset();
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

function applySmartHeaderOffset() {
  if (!currentSettings.smartHeaderOffset) return;
  collectTopPinnedElements().forEach((el) => {
    if (adjustedLayoutElements.has(el)) return;
    const style = window.getComputedStyle(el);
    const topPx = parseFloat(style.top);
    const top = Number.isFinite(topPx) ? topPx : 0;
    el.style.setProperty('--wm-original-top', `${top}px`);
    el.classList.add('wm-offset-element');
    adjustedLayoutElements.add(el);
  });

  layoutObserver = new MutationObserver(scheduleLayoutRescan);
  layoutObserver.observe(document.documentElement, {
    attributes: true,
    childList: true,
    subtree: true,
    attributeFilter: ['class', 'style']
  });
  layoutObserverStopTimer = setTimeout(stopLayoutObserver, LAYOUT_OBSERVER_LIFETIME_MS);
}

function applyLayoutOffset() {
  document.documentElement.classList.add('wm-pushed');
  document.documentElement.style.setProperty('--wm-banner-offset', `${BANNER_HEIGHT}px`);
  applySmartHeaderOffset();
}

function setCurrentSettings(nextSettings, persistMigration = false) {
  currentSettings = normalizeSettings(nextSettings);
  if (persistMigration) {
    chrome.storage.sync.set(currentSettings);
  }
}

async function loadSettings() {
  const loaded = await chrome.storage.sync.get(settingsKey);
  const normalized = normalizeSettings(loaded);
  const migrated = JSON.stringify(loaded) !== JSON.stringify(normalized);
  setCurrentSettings(normalized, migrated);
}

function createInfoBox(label, value, className = '', titleValue = '') {
  const box = document.createElement('div');
  box.className = `wm-box${className ? ` ${className}` : ''}`;

  const labelEl = document.createElement('span');
  labelEl.textContent = `${label}:`;
  box.appendChild(labelEl);

  const valueEl = document.createElement('span');
  valueEl.className = 'wm-value';
  valueEl.textContent = value;
  box.appendChild(valueEl);

  if (titleValue) {
    box.title = titleValue;
  }

  return box;
}

function createBannerLayout(settings, values) {
  const wrap = document.createElement('div');
  wrap.className = 'wm-wrap';

  if (settings.showUrl) {
    wrap.appendChild(createInfoBox('URL', values.url, 'wm-url-box', values.url));
  }
  if (settings.showDate) {
    wrap.appendChild(createInfoBox('DATE', values.date));
  }
  if (settings.showTime) {
    wrap.appendChild(createInfoBox('TIME', values.time));
  }
  if (settings.showCountry) {
    wrap.appendChild(createInfoBox('LOC', values.country || 'Unknown'));
  }
  if (settings.showIp) {
    wrap.appendChild(createInfoBox('IP', values.ip || 'Unavailable'));
  }
  if (settings.showViewport) {
    wrap.appendChild(createInfoBox('VIEW', values.viewport));
  }
  if (settings.showUserAgent) {
    wrap.appendChild(createInfoBox('UA', values.userAgent, 'wm-ua-box', values.userAgent));
  }

  const actions = document.createElement('div');
  actions.className = 'wm-actions';

  const screenshotButton = document.createElement('button');
  screenshotButton.id = 'wm-screenshot';
  screenshotButton.setAttribute('aria-label', 'Take screenshot');
  screenshotButton.title = 'Download Screenshot';
  screenshotButton.textContent = '📷';
  screenshotButton.onclick = () => handleScreenshot(settings.screenshotType, settings.screenshotQuality);

  const closeButton = document.createElement('button');
  closeButton.id = 'wm-close';
  closeButton.setAttribute('aria-label', 'Hide banner');
  closeButton.title = 'Hide Banner';
  closeButton.textContent = '×';
  closeButton.onclick = () => window.toggleWebMark();

  actions.appendChild(screenshotButton);
  actions.appendChild(closeButton);

  bannerDiv.replaceChildren(wrap, actions);
}

async function render() {
  if (!chrome.runtime?.id) return;
  try {
    if (!currentSettings.settingsVersion) {
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

async function fetchWithTimeout(url, timeoutMs = 2500) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
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
            const res = await fetchWithTimeout('https://ipapi.co/json/');
            const data = await res.json();
            detectedCountry = data.country_name;
            chrome.storage.local.set({ cachedCountry: detectedCountry });
            country = detectedCountry;
          } catch {
            country = new Intl.DisplayNames(['en'], { type: 'region' }).of(new Intl.Locale(navigator.language).region || 'US');
          }
        }
      }
    }

    const now = new Date();
    const tz = settings.timezone === 'auto' ? undefined : settings.timezone;
    const values = {
      url: window.location.href,
      date: now.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: tz }),
      time: now.toLocaleTimeString(undefined, {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: tz, timeZoneName: 'short'
      }),
      country,
      ip: await getPublicIp(settings.showIp),
      viewport: `${window.innerWidth} x ${window.innerHeight}`,
      userAgent: getUserAgentDisplay()
    };

    createBannerLayout(settings, values);
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
    const res = await fetchWithTimeout('https://api64.ipify.org?format=json');
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

async function waitForCaptureSettle(settleMs) {
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  await new Promise((resolve) => setTimeout(resolve, settleMs));
}

async function captureTile() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'capture_visible' }, (response) => {
      if (!response?.ok) {
        resolve(null);
        return;
      }
      resolve(response.dataUrl);
    });
  });
}

function setAnimationSuppression(active) {
  if (active && !animationBlockStyle) {
    animationBlockStyle = document.createElement('style');
    animationBlockStyle.id = 'wm-animation-block-style';
    animationBlockStyle.textContent = '* { animation: none !important; transition: none !important; }';
    document.documentElement.appendChild(animationBlockStyle);
  }
  if (!active && animationBlockStyle) {
    animationBlockStyle.remove();
    animationBlockStyle = null;
  }
}

async function handleScreenshot(type, quality) {
  if (type === 'fullpage') {
    await captureFullPageScreenshot(quality);
  } else {
    chrome.runtime.sendMessage({ action: 'take_screenshot' });
  }
}

async function captureFullPageScreenshot(quality = 'balanced') {
  const profile = getCaptureProfile(quality);
  const originalX = window.scrollX;
  const originalY = window.scrollY;
  const originalOverflow = document.documentElement.style.overflow;
  const hadBanner = Boolean(bannerDiv);
  const originalBannerDisplay = bannerDiv?.style.display || '';
  const wasBannerVisible = bannerVisible;

  try {
    document.documentElement.style.overflow = 'hidden';
    setAnimationSuppression(profile.disableAnimation);
    if (hadBanner && bannerDiv) bannerDiv.style.display = 'none';
    clearLayoutOffset();
    window.scrollTo(0, 0);
    await waitForCaptureSettle(profile.settleMs);

    const totalWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    const totalHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const scale = window.devicePixelRatio || 1;

    const canvasWidth = Math.round(totalWidth * scale);
    const canvasHeight = Math.round(totalHeight * scale);
    if (canvasWidth > MAX_CAPTURE_DIMENSION || canvasHeight > MAX_CAPTURE_DIMENSION || (canvasWidth * canvasHeight) > MAX_CAPTURE_PIXELS) {
      chrome.runtime.sendMessage({ action: 'take_screenshot' });
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const stepX = viewportWidth;
    const stepY = viewportHeight;
    let failedTiles = 0;

    for (let y = 0; y < totalHeight; y += stepY) {
      for (let x = 0; x < totalWidth; x += stepX) {
        const tileWidth = Math.min(viewportWidth, totalWidth - x);
        const tileHeight = Math.min(viewportHeight, totalHeight - y);
        window.scrollTo(x, y);
        await waitForCaptureSettle(profile.settleMs);

        const dataUrl = await captureTile();
        if (!dataUrl) {
          failedTiles += 1;
          if (failedTiles > 2) {
            chrome.runtime.sendMessage({ action: 'take_screenshot' });
            return;
          }
          continue;
        }

        await new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            const sourceWidth = Math.min(img.naturalWidth, Math.round(tileWidth * scale));
            const sourceHeight = Math.min(img.naturalHeight, Math.round(tileHeight * scale));
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
          img.onerror = () => {
            failedTiles += 1;
            resolve();
          };
          img.src = dataUrl;
        });
      }
    }

    const fullDataUrl = canvas.toDataURL('image/png');
    chrome.runtime.sendMessage({ action: 'download_screenshot', dataUrl: fullDataUrl }, () => {});
  } catch (error) {
    console.error('Web Mark full-page screenshot failed:', error);
    chrome.runtime.sendMessage({ action: 'take_screenshot' });
  } finally {
    setAnimationSuppression(false);
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
  const merged = { ...currentSettings };
  Object.keys(changes).forEach((key) => {
    merged[key] = changes[key].newValue;
  });
  setCurrentSettings(merged);
  render();
});

window.addEventListener('resize', scheduleLayoutRescan);
window.addEventListener('scroll', scheduleLayoutRescan, { passive: true });

setInterval(() => {
  if (bannerVisible && bannerDiv && chrome.runtime?.id) {
    updateData();
  }
}, 1000);

loadSettings().then(render).catch((error) => {
  console.error('Web Mark initial load failed:', error);
  render();
});
