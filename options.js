const fields = [
  'settingsVersion',
  'enabled',
  'showUrl',
  'showDate',
  'showTime',
  'showCountry',
  'showIp',
  'showViewport',
  'showUserAgent',
  'timezone',
  'manualCountry',
  'theme',
  'screenshotType',
  'screenshotQuality',
  'smartHeaderOffset'
];

const normalizeSettings = window.WEB_MARK_NORMALIZE_SETTINGS || ((input) => ({ ...(window.WEB_MARK_DEFAULTS || {}), ...input }));
const defaults = window.WEB_MARK_DEFAULTS || {};

const fallbackTimezones = [
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney'
];

const populateTimezones = () => {
  const select = document.getElementById('timezone');
  const zones = typeof Intl.supportedValuesOf === 'function'
    ? Intl.supportedValuesOf('timeZone')
    : fallbackTimezones;

  zones.forEach((tz) => {
    const opt = document.createElement('option');
    opt.value = tz;
    opt.textContent = tz.replace(/_/g, ' ');
    select.appendChild(opt);
  });
};

const showStatus = (message, isError = false) => {
  const status = document.getElementById('status');
  status.innerText = message;
  status.style.color = isError ? '#b00020' : '#1b5e20';
  setTimeout(() => {
    status.innerText = '';
  }, 1800);
};

const save = () => {
  const data = {};
  fields.forEach((field) => {
    const el = document.getElementById(field);
    if (!el) return;
    data[field] = el.type === 'checkbox' ? el.checked : el.value;
  });

  const normalized = normalizeSettings(data);
  chrome.storage.sync.set(normalized, () => {
    if (chrome.runtime.lastError) {
      showStatus(`Save failed: ${chrome.runtime.lastError.message}`, true);
      return;
    }
    showStatus('Saved successfully.');
  });
};

const load = () => {
  populateTimezones();
  chrome.storage.sync.get(fields, (items) => {
    const normalized = normalizeSettings({ ...defaults, ...items });
    chrome.storage.sync.set(normalized);

    fields.forEach((field) => {
      const el = document.getElementById(field);
      if (!el) return;
      if (el.type === 'checkbox') {
        el.checked = normalized[field] ?? defaults[field];
      } else {
        el.value = normalized[field] || defaults[field];
      }
    });
  });
};

document.addEventListener('DOMContentLoaded', load);
document.querySelectorAll('input, select').forEach((el) => {
  el.onchange = save;
});
