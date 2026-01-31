window.hasWebMarkLoaded = true;
let bannerVisible = true;
let bannerDiv = null;
let detectedCountry = null;
const settingsKey = { enabled: true, showUrl: true, showDate: true, showTime: true, showCountry: true, timezone: 'auto', manualCountry: '', theme: 'light' };

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
    
    bannerDiv.innerHTML = `
      <div class="wm-wrap">
        ${settings.showUrl ? `<div class="wm-box wm-url-box" title="${window.location.href}"><span>URL:</span>${window.location.href}</div>`:''}
        ${settings.showDate ? `<div class="wm-box"><span>DATE:</span>${dateStr}</div>`:''}
        ${settings.showTime ? `<div class="wm-box"><span>TIME:</span>${timeStr}</div>`:''}
        ${settings.showCountry ? `<div class="wm-box"><span>LOC:</span>${country}</div>`:''}
      </div>
      <div class="wm-actions">
        <button id="wm-screenshot" title="Download Screenshot">📷</button>
        <button id="wm-close" title="Hide Banner">×</button>
      </div>
    `;

    bannerDiv.querySelector('#wm-screenshot').onclick = () => {
      chrome.runtime.sendMessage({ action: "take_screenshot" });
    };
    bannerDiv.querySelector('#wm-close').onclick = () => window.toggleWebMark();
  } catch (e) {}
}

chrome.storage.onChanged.addListener(() => render());
setInterval(() => { if (bannerVisible && bannerDiv && chrome.runtime?.id) updateData(); }, 1000);
render();