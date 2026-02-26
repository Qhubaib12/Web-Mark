const fields = [
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
  'screenshotType'
];

const defaults = window.WEB_MARK_DEFAULTS || {
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

const populateTimezones = () => {
  const select = document.getElementById('timezone');
  if (typeof Intl.supportedValuesOf !== 'function') return;
  Intl.supportedValuesOf('timeZone').forEach((tz) => {
    const opt = document.createElement('option');
    opt.value = tz;
    opt.textContent = tz.replace(/_/g, ' ');
    select.appendChild(opt);
  });
};

const save = () => {
  const data = {};
  fields.forEach((field) => {
    const el = document.getElementById(field);
    data[field] = el.type === 'checkbox' ? el.checked : el.value;
  });

  chrome.storage.sync.set(data, () => {
    const status = document.getElementById('status');
    status.innerText = 'Saved successfully.';
    setTimeout(() => {
      status.innerText = '';
    }, 1500);
  });
};

const load = () => {
  populateTimezones();
  chrome.storage.sync.get(fields, (items) => {
    fields.forEach((field) => {
      const el = document.getElementById(field);
      if (el.type === 'checkbox') {
        el.checked = items[field] ?? defaults[field];
      } else {
        el.value = items[field] || defaults[field];
      }
    });
  });
};

document.addEventListener('DOMContentLoaded', load);
document.querySelectorAll('input, select').forEach((el) => {
  el.onchange = save;
});
